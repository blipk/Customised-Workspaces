/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) http://github.com/blipk
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* global global */

/*
 * Workset wallpapers for the overview and for the workspace switch animation.
 *
 * This module does these tasks:
 * - It loads workset wallpapers into Meta.Background objects and keeps them in a cache.
 *   GNOME Shell 49 and 50 load image files with Meta.Background.set_file().
 *   GNOME Shell 51 removed set_file(). On 51 this module decodes the file with Glycin
 *   and gives the texture to Meta.Background.set_texture(). compat.js selects the method
 *   from the GNOME Shell version.
 * - It shows wallpapers in background actors that the extension owns. These actors do not use
 *   the GNOME background.BackgroundManager, thus they have no effect on the shared GNOME
 *   background cache.
 * - It records each GNOME BackgroundManager that shows a workset wallpaper, so that it can put
 *   the GNOME wallpaper back when the extension or its wallpaper management is disabled.
 */

// External imports
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import Meta from "gi://Meta"
import Cogl from "gi://Cogl"
import Clutter from "gi://Clutter"
import GDesktopEnums from "gi://GDesktopEnums"

// Internal imports
import * as dev from "./dev.js"
import * as compat from "./compat.js"
import * as fileUtils from "./fileUtils.js"

const DEFAULT_BACKGROUND_STYLE = "ZOOM"
const GLYCIN_MODULE = "gi://Gly?version=2"
const TEXTURE_PIXEL_FORMAT = Cogl.PixelFormat.RGBA_8888_PRE
const BASE_MIPMAP_LEVEL = 0
const BACKGROUND_CONTENT_PROPERTIES = {
    vignette           : false,
    vignette_sharpness : 0.5,
    brightness         : 0.5,
}

let glycinModule = null

/**
 * Imports Glycin on first use.
 * A static import would stop the extension from loading on systems that do not have the Gly typelib.
 * @returns {Promise<object>} The Gly module
 */
const getGlycin = async () => {
    glycinModule ??= ( await import( GLYCIN_MODULE ) ).default
    return glycinModule
}

/**
 * Calls a GIO style asynchronous method and gives a promise for its result.
 * @param {object} object - The object that has the method
 * @param {string} method - Name of the asynchronous method, for example "read_async"
 * @param {string} finish - Name of the finish method, for example "read_finish"
 * @param {...(number|Gio.Cancellable)} args - Arguments for the method, without the callback
 * @returns {Promise<object>} The value that the finish method returns
 */
const callAsync = ( object, method, finish, ...args ) => new Promise( ( resolve, reject ) => {
    object[method]( ...args, ( source, result ) => {
        try {
            resolve( source[finish]( result ) )
        } catch ( e ) { reject( e ) }
    } )
} )

/**
 * Converts a background style name such as "zoom" or "ZOOM" to a GDesktopEnums.BackgroundStyle value.
 * NONE has the value 0, thus it also becomes ZOOM. This is the same as in earlier versions of the extension.
 * @param {string} style - The style name
 * @returns {number} The GDesktopEnums.BackgroundStyle value
 */
const styleToEnum = ( style ) =>
    GDesktopEnums.BackgroundStyle[( style || DEFAULT_BACKGROUND_STYLE ).toUpperCase()] || GDesktopEnums.BackgroundStyle.ZOOM

/**
 * Makes a Cogl texture from a decoded Glycin frame.
 * @param {object} frame - A Gly.Frame in the R8G8B8A8_PREMULTIPLIED memory format
 * @returns {Cogl.Texture} The texture
 */
const textureFromFrame = ( frame ) => {
    const width = frame.get_width()
    const height = frame.get_height()
    const stride = frame.get_stride()
    const data = frame.get_buf_bytes().get_data()
    const coglContext = global.stage.context.get_backend().get_cogl_context()

    try {
        return Cogl.Texture2D.new_from_data( coglContext, width, height, TEXTURE_PIXEL_FORMAT, stride, data )
    } catch ( e ) {
        // An image that is larger than the maximum texture size needs a sliced texture
        const texture = Cogl.Texture2DSliced.new_with_size( coglContext, width, height, Cogl.TEXTURE_MAX_WASTE )
        texture.set_data( TEXTURE_PIXEL_FORMAT, stride, data, BASE_MIPMAP_LEVEL )
        return texture
    }
}

export class WorksetBackgrounds {
    /**
     * @param {function(): void} onLoaded - Called after one or more wallpapers finish loading in the background
     */
    constructor( onLoaded ) {
        this._onLoaded = onLoaded
        // Cache key -> { background: Meta.Background, loaded: boolean }
        this._entries = new Map()
        // GNOME BackgroundManager -> { actor, original, background, changedId }
        this._overrides = new Map()
        this._cancellable = new Gio.Cancellable()
        this._loadedIdleId = 0
    }

    destroy() {
        this._cancellable.cancel()
        if ( this._loadedIdleId ) {
            GLib.Source.remove( this._loadedIdleId )
            this._loadedIdleId = 0
        }
        this.restoreAll()
        this._entries.clear()
    }

    // Wallpaper cache

    /**
     * Gets the wallpaper of a workset for the light or the dark colour scheme.
     * @param {object} workset - The workset
     * @param {boolean} darkMode - True to get the dark mode wallpaper
     * @returns {Meta.Background|null} The wallpaper, or null if it is not available yet
     */
    forWorkset( workset, darkMode ) {
        if ( !workset ) return null
        return this.lookup(
            darkMode ? workset.BackgroundImageDark : workset.BackgroundImage,
            darkMode ? workset.BackgroundStyleDark : workset.BackgroundStyle
        )
    }

    /**
     * Gets a wallpaper from the cache. If the wallpaper is not in the cache, this starts to load it.
     * @param {string} pathOrUri - Path or URI of the image file
     * @param {string} style - Background style name, for example "ZOOM"
     * @returns {Meta.Background|null} The wallpaper, or null if it is not loaded yet or it cannot load
     */
    lookup( pathOrUri, style ) {
        const path = fileUtils.uriToPath( pathOrUri )
        if ( !path ) return null

        const key = this._cacheKey( path, style )
        let entry = this._entries.get( key )
        if ( !entry ) {
            entry = this._createEntry( path, style )
            this._entries.set( key, entry )
        }
        return entry.loaded ? entry.background : null
    }

    /**
     * Removes the cached wallpapers that the worksets do not use.
     * @param {Array<object>} worksets - All worksets of the session
     */
    prune( worksets ) {
        const usedKeys = new Set()
        for ( const workset of worksets ) {
            usedKeys.add( this._cacheKey( fileUtils.uriToPath( workset.BackgroundImage ), workset.BackgroundStyle ) )
            usedKeys.add( this._cacheKey( fileUtils.uriToPath( workset.BackgroundImageDark ), workset.BackgroundStyleDark ) )
        }
        for ( const key of [...this._entries.keys()] )
            if ( !usedKeys.has( key ) ) this._entries.delete( key )
    }

    _cacheKey( path, style ) {
        return `${styleToEnum( style )}|${path}`
    }

    _createEntry( path, style ) {
        const entry = { background: new Meta.Background( { meta_display: global.display } ), loaded: false }
        const file = Gio.File.new_for_path( path )

        if ( compat.needsBackgroundTextures ) {
            this._loadTexture( entry, file, styleToEnum( style ) )
        } else {
            // GNOME Shell 50 and earlier: mutter loads and caches the image
            entry.background.set_file( file, styleToEnum( style ) )
            entry.loaded = true
        }
        return entry
    }

    async _loadTexture( entry, file, style ) {
        try {
            const Gly = await getGlycin()
            const stream = await callAsync( file, "read_async", "read_finish", GLib.PRIORITY_DEFAULT, this._cancellable )
            const loader = Gly.Loader.new_for_stream( stream )
            loader.set_accepted_memory_formats( Gly.MemoryFormatSelection.R8G8B8A8_PREMULTIPLIED )
            const image = await callAsync( loader, "load_async", "load_finish", this._cancellable )
            const frame = await callAsync( image, "next_frame_async", "next_frame_finish", this._cancellable )

            if ( this._cancellable.is_cancelled() ) return
            if ( frame.get_memory_format() !== Gly.MemoryFormat.R8G8B8A8_PREMULTIPLIED )
                throw new Error( `Unexpected memory format ${frame.get_memory_format()}` )

            entry.background.set_texture( textureFromFrame( frame ), style, null )
            entry.loaded = true
            this._queueLoadedCallback()
        } catch ( e ) {
            if ( !e.matches?.( Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED ) )
                dev.log( `Could not load wallpaper '${file.get_path()}'`, e )
        }
    }

    _queueLoadedCallback() {
        if ( this._loadedIdleId ) return
        this._loadedIdleId = GLib.idle_add( GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._loadedIdleId = 0
            try {
                this._onLoaded()
            } catch ( e ) { dev.log( e ) }
            return GLib.SOURCE_REMOVE
        } )
    }

    // Background actors that the extension owns

    /**
     * Shows a wallpaper in a background actor that the extension owns.
     * The actor is made on the first call and is kept as owner._worksetBgActor.
     * @param {Clutter.Actor} owner - The actor that keeps the background actor, for example a workspace thumbnail
     * @param {Clutter.Actor} container - The parent for the background actor
     * @param {Meta.Background} background - The wallpaper to show
     * @param {object} placement - Where to put the background actor
     * @param {number} placement.monitorIndex - Index of the monitor that the wallpaper is for
     * @param {number} [placement.x=0] - Horizontal position in the container
     * @param {number} [placement.y=0] - Vertical position in the container
     * @param {Clutter.Actor|null} [placement.siblingBelow=null] - Put the actor directly above this child of the container
     * @param {boolean} [placement.atBottom=false] - Put the actor below all other children of the container
     */
    showInOwnActor( owner, container, background, { monitorIndex, x = 0, y = 0, siblingBelow = null, atBottom = false } ) {
        let actor = owner._worksetBgActor
        if ( !actor ) {
            actor = new Meta.BackgroundActor( {
                meta_display : global.display,
                monitor      : monitorIndex,
                request_mode : Clutter.RequestMode.CONTENT_SIZE,
            } )
            actor.content.set( { ...BACKGROUND_CONTENT_PROPERTIES, background } )
            container.add_child( actor )
            // The container can destroy the actor, for example when a thumbnail is destroyed
            actor.connect( "destroy", () => {
                if ( owner._worksetBgActor === actor ) owner._worksetBgActor = null
            } )
            owner._worksetBgActor = actor
        }

        actor.set_position( x, y )
        if ( siblingBelow && siblingBelow.get_parent() === container )
            container.set_child_above_sibling( actor, siblingBelow )
        else if ( atBottom )
            container.set_child_below_sibling( actor, null )

        if ( actor.content.background !== background )
            actor.content.background = background
    }

    /**
     * Destroys the background actor that showInOwnActor() made for an owner.
     * @param {Clutter.Actor} owner - The actor that keeps the background actor
     */
    removeOwnActor( owner ) {
        const actor = owner._worksetBgActor
        owner._worksetBgActor = null
        actor?.destroy()
    }

    // Background actors that GNOME owns

    /**
     * Shows a wallpaper in a BackgroundManager that GNOME owns, for example an overview workspace preview.
     * The GNOME wallpaper is recorded so that restore() can put it back.
     * When GNOME replaces its background actor (for example after a wallpaper setting changes),
     * the wallpaper is shown again in the new actor.
     * @param {object} bgManager - A GNOME background.BackgroundManager
     * @param {Meta.Background} background - The wallpaper to show
     */
    override( bgManager, background ) {
        const actor = bgManager?.backgroundActor
        if ( !actor?.content || !background ) return

        let record = this._overrides.get( bgManager )
        if ( !record ) {
            record = { actor, original: actor.content.background, background, changedId: 0 }
            record.changedId = bgManager.connect( "changed", () => this._onManagerChanged( bgManager ) )
            this._overrides.set( bgManager, record )
        } else if ( record.actor !== actor ) {
            record.actor = actor
            record.original = actor.content.background
        }

        record.background = background
        if ( actor.content.background !== background )
            actor.content.background = background
    }

    _onManagerChanged( bgManager ) {
        const record = this._overrides.get( bgManager )
        const actor = bgManager.backgroundActor
        if ( !record || !actor?.content ) return

        // GNOME made a new background actor that shows the GNOME wallpaper
        record.actor = actor
        record.original = actor.content.background
        actor.content.background = record.background
    }

    /**
     * Puts the GNOME wallpaper back in a BackgroundManager that override() changed.
     * @param {object} bgManager - A GNOME background.BackgroundManager
     */
    restore( bgManager ) {
        const record = this._overrides.get( bgManager )
        if ( !record ) return

        this._overrides.delete( bgManager )
        bgManager.disconnect( record.changedId )

        // If GNOME destroyed or replaced the actor, there is nothing to put back
        const actor = bgManager.backgroundActor
        if ( actor && actor === record.actor && actor.content && record.original )
            actor.content.background = record.original
    }

    /** Puts the GNOME wallpaper back in all BackgroundManagers that override() changed. */
    restoreAll() {
        for ( const bgManager of [...this._overrides.keys()] )
            this.restore( bgManager )
    }
}
