/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) 2023 A.D. http://github.com/blipk
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

// External imports
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import Meta from "gi://Meta"
import Shell from "gi://Shell"
import Clutter from "gi://Clutter"
import GDesktopEnums from "gi://GDesktopEnums"

import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as util from "resource:///org/gnome/shell/misc/util.js"
import * as appFavorites from "resource:///org/gnome/shell/ui/appFavorites.js"
// import * as appMenu from "resource:///org/gnome/shell/ui/appMenu.js"
// import * as appDisplay from "resource:///org/gnome/shell/ui/appDisplay.js"
// import * as dash from "resource:///org/gnome/shell/ui/dash.js"



// Internal imports
import { WorksetsInstance as Me } from "./extension.js"
import * as dev from "./dev.js"
import * as utils from "./utils.js"
import * as uiUtils from "./lib/ui/uiUtils.js"
import * as dialogs from "./lib/ui/dialogs.js"
import * as fileUtils from "./fileUtils.js"
import * as panelIndicator from "./panelIndicator.js"
import * as workspaceManager from "./workspaceManager.js"
import * as workspaceView from "./workspaceView.js"

const wallPaperOptions = [
    { enum: "NONE", icon: "window-close-symbolic" },
    { enum: "WALLPAPER", icon: "open-menu-symbolic" },
    { enum: "CENTERED", icon: "format-justify-center-symbolic" },
    { enum: "SCALED", icon: "format-justify-center-symbolic" },
    { enum: "ZOOM", icon: "zoom-in-symbolic" },
    { enum: "STRETCHED", icon: "zoom-fit-best-symbolic" },
    { enum: "SPANNED", icon: "zoom-fit-best-symbolic" }
]

export class SessionManager {
    constructor() {
        try {
            Me.session = this
            this.wallPaperOptions = wallPaperOptions
            this.activeSession = null
            this.allApps = {}

            this.signals = new utils.SignalHandler()
            this.activeFunctions = {}

            // Change tracking for session saves
            this._sessionHash = null

            // Initialize settings early (needed by newSession if no session.json exists)
            this.iSettings = new Gio.Settings( {schema_id: "org.gnome.desktop.interface"} )
            this.bSettings = new Gio.Settings( {schema_id: "org.gnome.desktop.background"} )

            // Make sure our GTK App chooser is executable
            util.spawn( ["chmod", "+x", fileUtils.APP_CHOOSER_EXEC()] )

            // Create sesion or initialize from session file if it exists
            const targetSession = fileUtils.checkExists( fileUtils.CONF_DIR() + "/session.json" )
                ? fileUtils.loadJSObjectFromFile( "session.json", fileUtils.CONF_DIR() )
                : this.newSession( true )


            this._setup( targetSession )

            // Profiling to figure out why this.setFavorites() is so slow...
            // const injectionHandler = new utils.InjectionHandler()
            // injectionHandler.add(
            //     appFavorites.getAppFavorites().__proto__ , "reload",
            //     ( originalMethod ) =>
            //         function ( ) {
            //             dev.timer( "appFavorites.AppFavorites.reload" )
            //             originalMethod.call( this )
            //             dev.timer( "appFavorites.AppFavorites.reload" )
            //         }
            // )
            // injectionHandler.add(
            //     appMenu.AppMenu.prototype, "_updateFavoriteItem",
            //     ( originalMethod ) =>
            //         function ( ) {
            //             dev.timer( "appMenu.AppMenu._updateFavoriteItem" )
            //             originalMethod.call( this )
            //             dev.timer( "appMenu.AppMenu._updateFavoriteItem" )
            //         }
            // )

            // This is the one taking the longest @ 30+ms,
            // about half the time of this.displayWorkset()
            // and 75% of this.setFavorites()
            // injectionHandler.add(
            //     appDisplay.AppDisplay.prototype, "_redisplay",
            //     ( originalMethod ) =>
            //         function ( ) {
            //             dev.timer( "appDisplay.AppDisplay._redisplay" )
            //             originalMethod.call( this )
            //             dev.timer( "appDisplay.AppDisplay._redisplay" )
            //         }
            // )

            // injectionHandler.add(
            //     dash.Dash.prototype, "_queueRedisplay",
            //     ( originalMethod ) =>
            //         function ( ) {
            //             dev.timer( "dash.Dash._queueRedisplay" )
            //             originalMethod.call( this )
            //             dev.timer( "dash.Dash._queueRedisplay" )
            //         }
            // )
        } catch ( e ) { dev.log( e ) }
    }
    destroy() {
        try {
            this.saveSession()
            this.signals.destroy()
        } catch ( e ) { dev.log( e ) }
    }
    _watchOptions() {
        if ( this.optionsWatched )
            return

        // Set up our bindings
        this.favoritesSet = false
        this.signals.add( appFavorites.getAppFavorites(), "changed", () => {
            if ( this.favoritesSet ) return

            try {
                this.Worksets.forEach( function ( worksetBuffer, worksetIndex ) {
                    if ( worksetBuffer.WorksetName == Me.workspaceManager.activeWorksetName ) {
                        this.Worksets[worksetIndex].FavApps = this.getFavorites()
                    }
                }, this )
                this.saveSession()
            } catch ( e ) { dev.log( e ) }
        } )

        this.signals.add( Me.settings, "changed::isolate-workspaces", () => {
            Me.session.activeSession.Options.IsolateWorkspaces = Me.settings.get_boolean( "isolate-workspaces" )
        } )
        if ( Me.gExtensions.dash2panelSettings() )
            this.signals.add( Me.gExtensions.dash2panelSettings(), "changed::isolate-workspaces", () => {
                Me.settings.set_boolean( "isolate-workspaces", Me.gExtensions.dash2panelSettings().get_boolean( "isolate-workspaces" ) )
                Me.session.saveSession()
            } )

        this.signals.add( Me.settings, "changed::show-workspace-overlay", () => {
            if ( Me.workspaceViewManager ) Me.workspaceViewManager.refreshOverview()
        } )
        this.signals.add( Me.settings, "changed::show-overlay-thumbnail-labels", () => {
            if ( Me.workspaceViewManager ) Me.workspaceViewManager.refreshOverview()
        } )
        this.signals.add( Me.settings, "changed::disable-wallpaper-management", () => {
            this.setBackground()
            if ( Me.workspaceViewManager ) Me.workspaceViewManager.refreshOverview()
        } )

        // iSettings and bSettings are now initialized in constructor
        this.signals.add( this.iSettings, "changed::color-scheme", () => {
            // switched theme mode
            let isDarkMode = this.iSettings.get_string( "color-scheme" ) === "prefer-dark" ? true : false
            this.Worksets.forEach( function ( worksetBuffer, worksetIndex ) {
                if ( worksetBuffer.WorksetName != Me.workspaceManager.activeWorksetName ) return
                let bgPath = isDarkMode ? this.Worksets[worksetIndex].BackgroundImageDark : this.Worksets[worksetIndex].BackgroundImage
                let bgStyle = isDarkMode ? this.Worksets[worksetIndex].BackgroundStyleDark : this.Worksets[worksetIndex].BackgroundStyle
                this.setBackground( bgPath, bgStyle, isDarkMode )
            }, this )
        } )

        this.signals.add( this.bSettings, "changed::picture-uri", () => {
            if ( this.backgroundSet ) return
            // Update active workset wallpaper info if changed elsewhere in gnome
            let isDarkMode = this.iSettings.get_string( "color-scheme" ) === "prefer-dark" ? true : false
            let bgPath = this.bSettings.get_string( "picture-uri" )
            let bgStyle

            this.Worksets.forEach( function ( worksetBuffer, worksetIndex ) {
                if ( worksetBuffer.WorksetName != Me.workspaceManager.activeWorksetName ) return
                this.Worksets[worksetIndex].BackgroundImage = bgPath
                bgStyle = this.Worksets[worksetIndex].BackgroundStyle
                this.saveSession()
            }, this )

            if ( isDarkMode ) return
            this.setBackground( bgPath, bgStyle, false )
        } )
        this.signals.add( this.bSettings, "changed::picture-uri-dark", () => {
            if ( this.backgroundSet ) return
            // Update active workset wallpaper info if changed elsewhere in gnome

            let isDarkMode = this.iSettings.get_string( "color-scheme" ) === "prefer-dark" ? true : false
            let bgPath = this.bSettings.get_string( "picture-uri-dark" )
            let bgStyle

            this.Worksets.forEach( function ( worksetBuffer, worksetIndex ) {
                if ( worksetBuffer.WorksetName != Me.workspaceManager.activeWorksetName ) return
                this.Worksets[worksetIndex].BackgroundImageDark = bgPath
                bgStyle = this.Worksets[worksetIndex].BackgroundStyleDark
                this.saveSession()
            }, this )
            if ( !isDarkMode ) return
            this.setBackground( bgPath, bgStyle, true )
        } )
        this.signals.add( this.bSettings, "changed::picture-options", () => {
            if ( this.backgroundSet ) return

            let bgStyle = this.bSettings.get_string( "picture-options" )
            let bgPath = ""

            this.Worksets.forEach( function ( worksetBuffer, worksetIndex ) {
                if ( worksetBuffer.WorksetName != Me.workspaceManager.activeWorksetName ) return
                if ( this.isDarkMode ) {
                    this.Worksets[worksetIndex].BackgroundStyleDark = bgStyle
                    bgPath = this.Worksets[worksetIndex].BackgroundImageDark
                } else {
                    this.Worksets[worksetIndex].BackgroundStyle = bgStyle
                    bgPath = this.Worksets[worksetIndex].BackgroundImage
                }
                this.saveSession()
            }, this )

            this.setBackground( bgPath, bgStyle, this.isDarkMode )
        } )

        this.signals.add( Me.settings, "changed::show-panel-indicator", () => {

            if ( this.activeFunctions["_loadOptions"] ) {
                // dev.log( "ABORT SIGNAL" )
                return
            }

            // dev.log( `1 ${this.activeSession.Options.ShowPanelIndicator}` )
            this._loadOptions()
            // dev.log( `2 ${this.activeSession.Options.ShowPanelIndicator}` )

            if ( !Me.worksetsIndicator ) return
            if ( this.activeSession.Options.ShowPanelIndicator ) {
                Me.worksetsIndicator.show()
                // this.saveSession()
                Me.worksetsIndicator.menu.isOpen ? null : Me.worksetsIndicator.toggleMenu()
            }
        } )

        this.optionsWatched = true
    }
    _initOptions() {
        const keys = Me.settings.list_keys()
        keys.forEach( ( key ) => {
            const k = Me.settings.settings_schema.get_key( key )
            const defaultValue = k.get_default_value()
            if ( defaultValue.toString().includes( "\"b\"" ) ) { // GLib Variant Boolean
                this.activeSession.Options[utils.textToPascalCase( key )] = Me.settings.get_boolean( key )
            } else if ( defaultValue.toString().includes( "\"s\"" ) && !key.includes( "prototype" ) ) {
                this.activeSession.Options[utils.textToPascalCase( key )] = Me.settings.get_string( key )
            }
        }, this )
        this.activeSession.Options.forEachEntry( function ( optionName, optionValue ) {
            if ( keys.includes( utils.textToKebabCase( optionName ) ) ) return
            delete this.activeSession.Options[optionName]
        }, this )
        this._saveOptions()
    }
    _saveOptions() {
        this.activeFunctions["_saveOptions"] = true

        this.activeSession.Options.forEachEntry( function ( optionName, optionValue ) {
            const k = Me.settings.settings_schema.get_key( utils.textToKebabCase( optionName ) )
            const defaultValue = k.get_default_value()
            if ( defaultValue.toString().includes( "\"b\"" ) ) { // GLib Variant Boolean
                if ( optionName != "ShowPanelIndicator" )
                    Me.settings.set_boolean( utils.textToKebabCase( optionName ), this.activeSession.Options[optionName] )
            } else if ( defaultValue.toString().includes( "\"s\"" ) ) {
                Me.settings.set_string( utils.textToKebabCase( optionName ), this.activeSession.Options[optionName] )
            }
        }, this )
        // This has to be last or the signal callback will change the other options
        // dev.log( `0 ${this.activeSession.Options.ShowPanelIndicator}` )
        Me.settings.set_boolean( "show-panel-indicator", this.activeSession.Options.ShowPanelIndicator )

        this.activeFunctions["_saveOptions"] = false
    }
    _loadOptions() {
        // dev.log( "_loadOptions" )
        this.activeFunctions["_loadOptions"] = true

        this.activeSession.Options.forEachEntry( function ( optionName, optionValue ) {
            const k = Me.settings.settings_schema.get_key( utils.textToKebabCase( optionName ) )
            const defaultValue = k.get_default_value()
            if ( defaultValue.toString().includes( "\"b\"" ) ) { // GLib Variant Boolean
                this.activeSession.Options[optionName] = Me.settings.get_boolean( utils.textToKebabCase( optionName ) )
            } else if ( defaultValue.toString().includes( "\"s\"" ) ) {
                this.activeSession.Options[optionName] = Me.settings.get_string( utils.textToKebabCase( optionName ) )
            }
        }, this )

        this.activeFunctions["_loadOptions"] = false
    }
    _setup( sessionObject, fromLoad = false ) {
        try {
            if ( !utils.isEmpty( sessionObject ) ) {
                this.activeSession = sessionObject
                this.Worksets = this.activeSession.Worksets
                this.workspaceMaps = this.activeSession.workspaceMaps
                this.SessionName = this.activeSession.SessionName

                if ( !fromLoad ) this._initOptions()
                this._validateSession()
                this._loadOptions()

                if ( !fromLoad ) {
                    this._watchOptions()
                    this.saveSession()
                }


                if ( !Me.workspaceManager ) Me.workspaceManager = new workspaceManager.WorkspaceManager()
                if ( !Me.workspaceViewManager ) Me.workspaceViewManager = new workspaceView.WorkspaceViewManager()
                if ( !Me.worksetsIndicator ) Me.worksetsIndicator = new panelIndicator.WorksetsIndicator()
                this.activeSession.Options.ShowPanelIndicator ? Me.worksetsIndicator.show() : Me.worksetsIndicator.hide()

                // Initialize hash after setup
                if ( !fromLoad ) {
                    this._sessionHash = this._computeSessionHash()
                }
            }
        } catch ( e ) { dev.log( e ) }
    }
    resetIndicator() {
        try {
            Me.worksetsIndicator.destroy()
            delete Me.worksetsIndicator
            delete Main.panel.statusArea["WorksetsIndicator"]

            Me.worksetsIndicator = new panelIndicator.WorksetsIndicator()
            Me.worksetsIndicator.show()
        } catch ( e ) { dev.log( e ) }
    }
    _validateSession( saveSession = true ) {
        try {
            if ( utils.isEmpty( this.activeSession.Default ) )
                this.activeSession.Default = this.Worksets[0].WorksetName
            if ( typeof this.SessionName !== "string" )
                this.SessionName = "Default"

            // This doesn't work due to gnome bug where the compiled schemas for extensions are not in env properly
            //const worksetPrototype = Me.settings.get_key("workset-prototype-json").get_default_value()
            let filteredWorksets
            this.Worksets.forEach( function ( worksetBuffer, ii ) {
                //Fix entries
                if ( !Array.isArray( worksetBuffer.FavApps ) ) worksetBuffer.FavApps = []
                if ( typeof worksetBuffer.WorksetName !== "string" ) worksetBuffer.WorksetName = "Workset " + ii

                if ( typeof worksetBuffer.BackgroundImage !== "string" || !worksetBuffer.BackgroundImage )
                    worksetBuffer.BackgroundImage = this.getBackground()
                if ( typeof worksetBuffer.BackgroundImageDark !== "string" || !worksetBuffer.BackgroundImageDark )
                    worksetBuffer.BackgroundImageDark = this.getBackgroundDark() || worksetBuffer.BackgroundImage

                if ( typeof worksetBuffer.BackgroundStyle !== "string" || !worksetBuffer.BackgroundStyle )
                    worksetBuffer.BackgroundStyle = "ZOOM"
                if ( typeof worksetBuffer.BackgroundStyleDark !== "string" || !worksetBuffer.BackgroundStyleDark )
                    worksetBuffer.BackgroundStyleDark = worksetBuffer.BackgroundStyle

                // Remove duplicate entries
                filteredWorksets = this.Worksets.filter( function ( item ) {
                    if ( item !== worksetBuffer &&
                        ( JSON.stringify( item ) === JSON.stringify( worksetBuffer ) ) ) { return false }
                    return true
                }, this )
            }, this )
            this.Worksets = filteredWorksets



            // Clean workspace maps
            let worksetNames = []
            this.Worksets.forEach( ( workset ) => {
                worksetNames.push( workset.WorksetName )
            }, this )

            const mappedWorkspaces = []
            this.workspaceMaps.forEachEntry( ( workspaceMapKey, workspaceMapValues, i ) => {
                // Remove non-existant worksets
                if ( !worksetNames.includes( workspaceMapValues.currentWorkset ) )
                    this.workspaceMaps[workspaceMapKey].currentWorkset = ""

                if ( !worksetNames.includes( workspaceMapValues.defaultWorkset ) )
                    this.workspaceMaps[workspaceMapKey].defaultWorkset = ""

                // Remove workset already mapped to a default workspace (allow only 1)
                if ( mappedWorkspaces.includes( workspaceMapValues.defaultWorkset ) )
                    this.workspaceMaps[workspaceMapKey].defaultWorkset = ""

                // Keep track of names of worksets mapped to defaults
                if ( workspaceMapValues.defaultWorkset )
                    mappedWorkspaces.push( workspaceMapValues.defaultWorkset )
            }, this )

            this.activeSession.Worksets = this.Worksets
            this.activeSession.workspaceMaps = this.workspaceMaps
            this.activeSession.workspaceMaps = this.workspaceMaps
            this.activeSession.SessionName = this.SessionName

            if ( saveSession ) this.saveSession()
        } catch ( e ) { dev.log( e ) }
    }
    loadSession( sessionsObject ) {
        try {
            if ( utils.isEmpty( sessionsObject ) )
                sessionsObject = fileUtils.loadJSObjectFromFile( "session.json", fileUtils.CONF_DIR() )
            this._setup( sessionsObject, true )

            if ( Me.workspaceViewManager ) Me.workspaceViewManager.refreshOverview()

            // Initialize hash after loading session
            this._sessionHash = this._computeSessionHash()
        } catch ( e ) { dev.log( e ) }
    }
    saveSession( backup = false ) {
        try {
            // dev.log( "saveSession" )

            if ( utils.isEmpty( this.activeSession ) ) return false

            // Compute hash of current in-memory state
            const newHash = this._computeSessionHash()

            // Only save if session actually changed (or if creating backup)
            if ( !backup && newHash === this._sessionHash ) {
                // dev.log( "saveSession: No changes detected, skipping save" )
                return false // No save occurred
            }

            this._saveOptions()
            this._validateSession( false )

            let sessionCopy = JSON.parse( JSON.stringify( this.activeSession ) )
            let timestamp = new Date().toLocaleString().replace( /[^a-zA-Z0-9-. ]/g, "" ).replace( / /g, "" )
            let filename = ( backup ? "session-backup-" + timestamp + ".json" : "session.json" )
            fileUtils.saveToFile( sessionCopy, filename, fileUtils.CONF_DIR() )

            if ( Me.workspaceViewManager ) Me.workspaceViewManager.refreshOverview()

            // Update hash after successful save (only for non-backup saves)
            if ( !backup ) {
                this._sessionHash = newHash
            }

            // dev.timer( "saveSession" )
            return true // Save occurred
        } catch ( e ) {
            dev.log( e )
            return false
        }
    }
    applySession( callback ) {
        // dev.log( "applySession" )

        // saveSession now checks for changes and returns whether save occurred
        const didSave = this.saveSession()

        // Execute callback if provided
        if ( callback ) callback()

        // Only reload if we actually saved (to refresh from disk)
        if ( didSave ) {
            this.loadSession()
        } else {
            // No save occurred, just refresh UI without disk I/O
            if ( Me.workspaceViewManager ) {
                Me.workspaceViewManager.refreshOverview()
            }
        }
    }
    _computeSessionHash() {
        // Hash critical session fields to detect changes
        // Using JSON stringify for simplicity - only includes data that affects persistence
        try {
            const criticalData = {
                worksets       : this.activeSession.Worksets,
                workspaceMaps  : this.activeSession.workspaceMaps,
                options        : this.activeSession.Options,
                defaultWorkset : this.activeSession.Default,
                sessionName    : this.activeSession.SessionName
            }

            const jsonString = JSON.stringify( criticalData )
            return GLib.compute_checksum_for_string(
                GLib.ChecksumType.MD5,
                jsonString,
                -1
            )
        } catch ( e ) {
            dev.log( "Error computing session hash:", e )
            return null
        }
    }
    get isDarkMode() {
        // no-preference, prefer-dark, prefer-light
        return this.iSettings.get_string( "color-scheme" ) === "prefer-dark" ? true : false
    }
    getBackground() {
        try {
            let bgURI = this.bSettings.get_string( "picture-uri" )
            return bgURI.replace( "file://", "" )
        } catch ( e ) { dev.log( e ) }
    }
    getBackgroundDark() {
        try {
            let bgURI = this.bSettings.get_string( "picture-uri-dark" )
            return bgURI.replace( "file://", "" )
        } catch ( e ) { dev.log( e ) }
    }
    setBackground( bgPath = "", style = "ZOOM", darkMode = false ) {
        if ( this.activeSession.Options.DisableWallpaperManagement ) return

        if ( !bgPath )
            bgPath = this.Worksets.filter( w => w.WorksetName == Me.workspaceManager.activeWorksetName )[0].BackgroundImage
        bgPath = bgPath.replace( "file://", "" )

        const currentBackground = darkMode ? this.getBackgroundDark() : this.getBackground()
        const currentStyle = this.bSettings.get_string( "picture-options" )

        if ( currentBackground == bgPath && currentStyle == style )
            return

        this.backgroundSet = true
        darkMode
            ? this.bSettings.set_string( "picture-uri-dark", "file://" + bgPath )
            : this.bSettings.set_string( "picture-uri", "file://" + bgPath )

        this.bSettings.set_string( "picture-options", style.toLowerCase() )

        this.backgroundSet = false

        if ( ( darkMode && !this.isDarkMode ) || ( !darkMode && this.isDarkMode ) ) return

        // workspaceView is losing track of the original bgmanager so this has to be updated here to affect other changes in the system
        let newbg = new Meta.Background( { meta_display: Me.gScreen } )
        newbg.set_file( Gio.file_new_for_path( bgPath ), GDesktopEnums.BackgroundStyle[style.toUpperCase()] || GDesktopEnums.BackgroundStyle.ZOOM )

        Main.layoutManager._bgManagers.forEach( function ( bgMan, ii ) {
            if ( bgMan.backgroundActor ) {
                if ( bgMan.backgroundActor.content )
                    bgMan.backgroundActor.content.background = newbg
                else
                    bgMan.backgroundActor.background = newbg
            }
        }, this )
        //*/
        /*
        Main.layoutManager._bgManagers.forEach(function(bgMan, ii) {
            let x = bgMan._backgroundSource.getBackground(Main.layoutManager.primaryIndex);
            bgMan._backgroundSource._backgrounds = [];
            bgMan._backgroundSource._backgrounds[Main.layoutManager.primaryIndex] = x;
            bgMan._backgroundSource._backgrounds[0] = x;
            bgMan._backgroundSource._backgrounds[1] = x;
            bgMan._backgroundSource._backgrounds[2] = x;
            x.emit('bg-changed');
            bgMan._newBackgroundActor = "true";
            bgMan._updateBackgroundActor()
        }, this);
        //*/
    }
    setFavorites( favArray ) {
        try {
            favArray = favArray || this.Worksets.filter( w => w.WorksetName == Me.workspaceManager.activeWorksetName )[0].FavApps
            if ( !favArray ) return
            // dev.timer( "setFavorites" )

            const outFavorites = favArray.map( fav => fav.name )
            this.favoritesSet = true
            global.settings.set_strv( "favorite-apps", outFavorites )
            this.favoritesSet = false


            // dev.timer( "setFavorites" )
        } catch ( e ) { dev.log( e ) }
    }
    getFavorites( appList ) {
        try {
            this.scanInstalledApps()
            let currentFavorites = global.settings.get_strv( "favorite-apps" )
            if ( appList ) currentFavorites = appList
            let newFavorites = []

            currentFavorites.forEach( function ( favorite, i ) {
                if ( this.allApps[favorite] ) {
                    newFavorites.push( {
                        "name"        : favorite,
                        "displayName" : this.allApps[favorite].displayName,
                        "icon"        : this.allApps[favorite].icon || "",
                        "exec"        : this.allApps[favorite].exec || ""
                    } )
                }
            }, this )
            return newFavorites
        } catch ( e ) { dev.log( e ) }
    }
    removeFavorite( workset, appid ) {
        try {
            this.Worksets.forEach( function ( worksetBuffer, i ) {
                if ( worksetBuffer.WorksetName == workset.WorksetName ) {
                    this.Worksets[i].FavApps = worksetBuffer.FavApps.filter( favApps => favApps.name != appid )
                    if ( Me.workspaceManager.activeWorksetName == workset.WorksetName )
                        this.setFavorites( this.Worksets[i].FavApps )
                    return
                }
            }, this )
            this.saveSession()
        } catch ( e ) { dev.log( e ) }
    }
    scanInstalledApps() {
        // Shell.AppSystem includes flatpak and snap installed applications
        let installedApps = Shell.AppSystem.get_default().get_installed()
        installedApps.forEach( function ( app ) {
            let id = app.get_id()
            let name = app.get_name() || app.get_display_name() || "Unknown App Name"
            let exec = app.get_string( "Exec" )
            let icon = ""
            if ( app.get_icon() ) icon = app.get_icon().to_string()
            this.allApps[id] = { "displayName": name, "icon": icon, "exec": exec }
        }, this )
    }
    getWorksetActiveIndex( workset ) {
        let name = workset.WorksetName || workset
        let isActive = -1
        this.workspaceMaps.forEachEntry( function ( workspaceMapKey, workspaceMapValues ) {
            if ( workspaceMapValues.currentWorkset == name ) {
                isActive = parseInt( workspaceMapKey.substr( -1, 1 ) )
                return
            }
        }, this )

        return isActive
    }

    displayWorkset( workset, loadInNewWorkspace = false, displayOnly = false ) {

        try {
            let activeIndex = this.getWorksetActiveIndex( workset )

            // Don't do anything if the workset is a default here but already open elsewhere
            if ( this.workspaceMaps["Workspace" + Me.workspaceManager.activeWorkspaceIndex].defaultWorkset == workset.WorksetName
                 && this.ActiveWorksets.includes( workset.WorksetName )
                 && this.workspaceMaps["Workspace" + Me.workspaceManager.activeWorkspaceIndex].currentWorkset != workset.WorksetName )
                return

            // dev.timer( "displayWorkset" )

            if ( activeIndex > -1 && !displayOnly && !loadInNewWorkspace ) { // Switch to it if already active
                if ( Me.workspaceManager.activeWorkspaceIndex != activeIndex )
                    Me.workspaceManager.switchToWorkspace( activeIndex )
                if ( this.activeSession.Options.ShowNotifications )
                    uiUtils.showUserNotification( "Switched to active environment " + workset.WorksetName, false, 1 )
            } else if ( !displayOnly ) {
                if ( loadInNewWorkspace ) {
                    //Me.workspaceManager.lastWorkspaceActiveWorksetName = workset.WorksetName;
                    Me.workspaceManager._workspaceUpdate()
                    if ( typeof loadInNewWorkspace == "number" )
                        Me.workspaceManager.switchToWorkspace( loadInNewWorkspace )
                    else
                        Me.workspaceManager.switchToWorkspace( Me.workspaceManager.NumGlobalWorkspaces - 1 )
                }
                Me.workspaceManager.activeWorksetName = workset.WorksetName

                if ( this.activeSession.Options.ShowNotifications )
                    uiUtils.showUserNotification( "Loaded environment " + workset.WorksetName, false, 1.4 )
            }
            if ( this.activeSession.Options.CliSwitch ) Me.workspaceManager.spawnOnSwitch( workset )

            // dev.timer( "setFavorites" )

            this.setFavorites( workset.FavApps )

            // dev.timer( "setFavorites" )

            // dev.timer( "setBackground" )

            this.setBackground(
                this.isDarkMode ? workset.BackgroundImageDark : workset.BackgroundImage,
                this.isDarkMode ? workset.BackgroundStyleDark : workset.BackgroundStyle,
                this.isDarkMode
            )
            // dev.timer( "setBackground" )


            this.saveSession()
            // dev.timer( "displayWorkset" )
        } catch ( e ) { dev.log( e ) }
    }
    get DefaultWorkset() { // Returns the object from the WorksetName
        let index = this.Worksets.findIndex( w => w.WorksetName == this.activeSession.Default )
        if ( index === -1 )
            index = 0
        return this.Worksets[index]
    }
    get ActiveWorksets() {
        // Returns names of all active worksets
        let openedWorksets = []
        this.workspaceMaps.forEachEntry( function ( workspaceMapKey, workspaceMapValues ) {
            openedWorksets.push( workspaceMapValues.currentWorkset )
        }, this )

        return openedWorksets
    }
    closeWorkset( workset ) {
        try {
            let closing
            this.workspaceMaps.forEachEntry( function ( workspaceMapKey, workspaceMapValues ) {
                if ( workspaceMapValues.currentWorkset == workset.WorksetName ) closing = workspaceMapKey
            }, this )
            this.workspaceMaps[closing].currentWorkset = ""

            // Show the default
            if ( parseInt( closing.substr( -1, 1 ) ) == Me.workspaceManager.activeWorkspaceIndex )
                this.displayWorkset( this.DefaultWorkset, false, true )

            if ( this.activeSession.Options.ShowNotifications )
                uiUtils.showUserNotification( "Environment '" + workset.WorksetName + "' disengaged.", false, 1.8 )
            this.saveSession()
        } catch ( e ) { dev.log( e ) }
    }

    // Workset Management
    setWorksetBackgroundImage( workset, darkMode = false ) {
        try {
            let msg = darkMode ? "Dark Mode" : "Light Mode"
            utils.spawnWithCallback(
                null, ["/usr/bin/zenity",
                    "--file-selection",
                    "--title=Choose Background for " + workset.WorksetName + " (" + msg + ")"], GLib.get_environ(), 0, null,
                ( resource ) => {
                    try {
                        if ( !resource ) return

                        resource = resource.trim().split( "\n" )[0]
                        let filePath = GLib.path_get_dirname( resource )
                        let fileName = GLib.path_get_basename( resource )

                        // Find the workset and update the background image path property
                        let bgStyle
                        this.Worksets.forEach( function ( worksetBuffer, worksetIndex ) {
                            if ( worksetBuffer.WorksetName != workset.WorksetName ) return
                            if ( darkMode ) {
                                this.Worksets[worksetIndex].BackgroundImageDark = resource
                                bgStyle = this.Worksets[worksetIndex].BackgroundStyleDark
                            } else {
                                this.Worksets[worksetIndex].BackgroundImage = resource
                                bgStyle = this.Worksets[worksetIndex].BackgroundStyle
                            }
                            this.Worksets[worksetIndex].BackgroundStyle = this.Worksets[worksetIndex].BackgroundStyle || "ZOOM"
                            this.Worksets[worksetIndex].BackgroundStyleDark = this.Worksets[worksetIndex].BackgroundStyleDark || "ZOOM"
                            this.saveSession()
                        }, this )

                        let msg = darkMode ? "Dark Mode" : "Light Mode"
                        uiUtils.showUserNotification( "Background Image Changed (" + msg + ")", true )
                        if ( Me.workspaceManager.activeWorksetName == workset.WorksetName ) {
                            if ( ( darkMode && this.isDarkMode ) || ( !darkMode && !this.isDarkMode ) ) {
                                this.setBackground( resource, bgStyle, this.isDarkMode )
                            }
                        }
                        if ( Me.workspaceViewManager ) Me.workspaceViewManager.refreshOverview()
                    } catch ( e ) { dev.log( e ) }
                }
            )
        } catch ( e ) { dev.log( e ) }
    }
    newSession( fromEnvironment = false, backup = false ) {
        try {
            if ( backup ) this.saveSession( true )

            //Create new session object from protoype in gschema
            let sessionObject = JSON.parse( Me.settings.get_string( "session-prototype-json" ) )
            let workspaceMaps = JSON.parse( Me.settings.get_string( "workspace-maps-prototype-json" ) )

            if ( fromEnvironment ) {
                //Build on prototype from current environment, blank prototype workset add all current FavApps to Primary workset
                sessionObject.SessionName = "Default"
                sessionObject.Worksets[0].FavApps = this.getFavorites()
                sessionObject.Worksets[0].WorksetName = "Primary"
                sessionObject.Worksets[0].BackgroundImage = this.getBackground()
                sessionObject.Worksets[0].BackgroundImageDark = this.getBackgroundDark()
                sessionObject.Worksets[0].BackgroundStyle = "ZOOM"
                sessionObject.Worksets[0].BackgroundStyleDark = "ZOOM"
                sessionObject.workspaceMaps = workspaceMaps
                sessionObject.workspaceMaps["Workspace0"].defaultWorkset = "Primary"
                sessionObject.workspaceMaps["Workspace0"].currentWorkset = "Primary"
            } else {
                sessionObject.SessionName = "Default"
                sessionObject.Worksets[0].WorksetName = "New"
                sessionObject.workspaceMaps = workspaceMaps
                sessionObject.workspaceMaps["Workspace0"].defaultWorkset = "New"
                sessionObject.workspaceMaps["Workspace0"].currentWorkset = "New"
            }
            //Load the session
            this.loadSession( sessionObject )
            return this.activeSession
        } catch ( e ) { dev.log( e ) }
    }
    newWorkset( name, fromEnvironment = true, activate = false ) {
        try {
            //Create new workset object from protoype in gschema
            let worksetObject = JSON.parse( Me.settings.get_string( "workset-prototype-json" ) )
            let currentFavoriteApplications = this.getFavorites()
            let currentRunningApplications = this.getFavorites( Me.workspaceManager.getWorkspaceAppIds() )

            // Remove duplicates
            let newFavs = currentFavoriteApplications.concat( currentRunningApplications )
            newFavs = newFavs.filter( ( item, index, self ) => index === self.findIndex( ( t ) => ( t.name === item.name ) ) )

            if ( fromEnvironment ) {
                //Build on prototype from current environment, add all current FavApps+RunningApps to it
                worksetObject.FavApps = newFavs
            } else {
                //Blank prototype with no FavApps
                worksetObject.FavApps = []
            }

            worksetObject.BackgroundImage = this.getBackground()
            worksetObject.BackgroundImageDark = this.getBackgroundDark()

            if ( !name ) {
                // const timestamp = new Date().toLocaleString().replace( /[^a-zA-Z0-9-. ]/g, "" ).replace( / /g, "-" )
                let buttonStyles = [{ label: "Cancel", key: Clutter.KEY_Escape, action: function () { this.close( " " ) } },
                    { label: "Done", default: true }]
                let getNewWorksetNameDialog = new dialogs.ObjectInterfaceDialog( "Please enter name for the new custom workspace:", ( returnText ) => {
                    if ( !returnText ) return
                    returnText = returnText.trim()
                    if ( returnText == "" ) return

                    let exists = false
                    this.Worksets.forEach( function ( worksetBuffer ) {
                        if ( worksetBuffer.WorksetName == returnText ) {
                            exists = true
                            uiUtils.showUserNotification( "Environment with name '" + returnText + "' already exists." )
                        }
                    }, this )
                    if ( exists ) return

                    worksetObject.WorksetName = returnText

                    //Push it to the session
                    this.Worksets.push( worksetObject )
                    this.saveSession()
                    if ( activate ) this.displayWorkset( this.Worksets[this.Worksets.length - 1] )
                    uiUtils.showUserNotification( "Environment " + returnText + " created." )
                }, true, false, [], [], buttonStyles, "" )
            } else {
                worksetObject.WorksetName = name
                //Push it to the session
                this.Worksets.push( worksetObject )
                this.saveSession()
                if ( activate ) this.displayWorkset( this.Worksets[this.Worksets.length - 1] )
            }

        } catch ( e ) { dev.log( e ) }
    }
    editWorkset( worksetIn ) {
        try {
            let editable = {}
            Object.assign( editable, worksetIn )
            let workSpaceOptions = { Workspace0: false, Workspace1: false, Workspace2: false, Workspace3: false, Workspace4: false }
            let workSpaceOptions2 = { Workspace5: false, Workspace6: false, Workspace7: false, Workspace8: false, Workspace9: false }
            this.workspaceMaps.forEachEntry( function ( workspaceMapKey, workspaceMapValues, i ) {
                try {
                    if ( workspaceMapValues.defaultWorkset == worksetIn.WorksetName ) {
                        if ( workSpaceOptions[workspaceMapKey] != undefined ) workSpaceOptions[workspaceMapKey] = true
                        if ( workSpaceOptions2[workspaceMapKey] != undefined ) workSpaceOptions2[workspaceMapKey] = true
                    }
                } catch ( e ) { dev.log( e ) }
            }, this )

            editable.workSpaceOptionsLabel = "Null"
            editable.workSpaceOptions = workSpaceOptions
            editable.workSpaceOptions2 = workSpaceOptions2
            let workspaceOptionsEditables = [{ Workspace0: "First", Workspace1: "Second", Workspace2: "Third", Workspace3: "Fourth", Workspace4: "Fifth" }]
            let workspaceOptionsEditables2 = [{ Workspace5: "Sixth", Workspace6: "Seventh", Workspace7: "Eighth", Workspace8: "Ninth", Workspace9: "Tenth" }]

            let editables = [
                { WorksetName: "Name" },
                { BackgroundImage: " ", hidden: true },
                { workSpaceOptionsLabel: "Opens on this workspaces automatically (select only one):", labelOnly: true },
                { workSpaceOptions: " ", subObjectEditableProperties: workspaceOptionsEditables },
                { workSpaceOptions2: " ", subObjectEditableProperties: workspaceOptionsEditables2 }
            ]
            let buttonStyles = [{ label: "Cancel", key: Clutter.KEY_Escape, action: function () { this.returnObject = false, this.close( true ) } },
                { label: "Done", default: true }]

            let editObjectChooseDialog = new dialogs.ObjectEditorDialog( "Editing: " + worksetIn.WorksetName, ( returnObject ) => {
                if ( !returnObject ) return
                returnObject.WorksetName = returnObject.WorksetName.trim()
                if ( returnObject.WorksetName == "" ) return

                // Update workspace maps - this currently overrides any previous worksets assigned to the workspace
                Object.assign( returnObject.workSpaceOptions, returnObject.workSpaceOptions2 )
                returnObject.workSpaceOptions.forEachEntry( function ( workSpaceOptionsKey, workSpaceOptionsValue, i ) {
                    if ( this.workspaceMaps[workSpaceOptionsKey] == undefined )
                        Object.assign( this.workspaceMaps, { [workSpaceOptionsKey]: { "defaultWorkset": "", "currentWorkset": "" } } )

                    if ( workSpaceOptionsValue == true )
                        this.workspaceMaps[workSpaceOptionsKey].defaultWorkset = returnObject.WorksetName
                    else if ( workSpaceOptionsValue == false && this.workspaceMaps[workSpaceOptionsKey].defaultWorkset == returnObject.WorksetName )
                        this.workspaceMaps[workSpaceOptionsKey].defaultWorkset = ""
                }, this )

                // Update the name on the maps if it has changed
                this.workspaceMaps.forEachEntry( function ( workspaceMapKey, workspaceMapValues ) {
                    if ( workspaceMapValues.defaultWorkset == worksetIn.WorksetName )
                        this.workspaceMaps[workspaceMapKey].defaultWorkset = returnObject.WorksetName
                    if ( workspaceMapValues.currentWorkset == worksetIn.WorksetName )
                        this.workspaceMaps[workspaceMapKey].currentWorkset = returnObject.WorksetName
                }, this )

                // Update workset name and favorite state
                this.Worksets.forEach( function ( workset, worksetIndex ) {
                    if ( workset.WorksetName == worksetIn.WorksetName ) {
                        // Update if default
                        if ( this.activeSession.Default == this.Worksets[worksetIndex].WorksetName )
                            this.activeSession.Default = returnObject.WorksetName
                        this.Worksets[worksetIndex].WorksetName = returnObject.WorksetName
                    }
                }, this )

                this.applySession()
                Me.workspaceManager.loadDefaultWorksets()
                uiUtils.showUserNotification( "Changes saved." )
            }, editable, editables, buttonStyles )
        } catch ( e ) { dev.log( e ) }
    }
    deleteWorkset( workset ) {
        try {
            let backupFilename = this.saveWorkset( workset, true )
            // Remove it as the default on any workspace
            this.workspaceMaps.forEachEntry( function ( workspaceMapKey, workspaceMapValues ) {
                if ( workspaceMapValues.defaultWorkset == workset.WorksetName )
                    this.workspaceMaps[workspaceMapKey].defaultWorkset = ""
                if ( workspaceMapValues.currentWorkset == workset.WorksetName )
                    this.workspaceMaps[workspaceMapKey].currentWorkset = ""
            }, this )

            this.Worksets = this.Worksets.filter( item => item !== workset )
            this.saveSession()
            uiUtils.showUserNotification( "Environment removed from session and backup saved to " + backupFilename, true )
        } catch ( e ) { dev.log( e ) }
    }
    setDefaultWorkset( workset ) {
        try {
            let name = workset.WorksetName || workset
            this.activeSession.Default = name
            if ( this.workspaceMaps["Workspace" + Me.workspaceManager.activeWorkspaceIndex].currentWorkset == "" )
                Me.session.displayWorkset( Me.session.DefaultWorkset, false, true )
            this.applySession()
        } catch ( e ) { dev.log( e ) }
    }

    // Storage management
    loadObject() {
        try {
            let worksetsDirectory = fileUtils.CONF_DIR() + "/envbackups"
            let loadObjectDialog = new dialogs.ObjectInterfaceDialog( "Select a backup to load in to the session", ( returnObject ) => {
                if ( returnObject.WorksetName ) {
                    let exists = false
                    this.Worksets.forEach( function ( worksetBuffer ) {
                        if ( worksetBuffer.WorksetName == returnObject.WorksetName ) {
                            exists = true
                            uiUtils.showUserNotification( "Environment with name '" + returnObject.WorksetName + "' already exists." )
                        }
                    }, this )
                    if ( exists ) return

                    this.Worksets.push( returnObject )
                    this.saveSession()
                    uiUtils.showUserNotification( "Loaded " + returnObject.WorksetName + " from file and added to active session." )
                }

            }, false, true, [worksetsDirectory], [{ WorksetName: "Worksets" }] )
        } catch ( e ) { dev.log( e ) }
    }
    saveWorkset( workset, backup = false ) {
        try {
            if ( utils.isEmpty( workset ) ) return

            let timestamp = new Date().toLocaleString().replace( /[^a-zA-Z0-9-. ]/g, "" ).replace( / /g, "" )
            let filename = ( backup ? "env-" + workset.WorksetName + "-" + timestamp + ".json" : "env-" + workset.WorksetName + ".json" )

            fileUtils.saveToFile( workset, filename, fileUtils.CONF_DIR() + "/envbackups" )
            if ( !backup ) uiUtils.showUserNotification( "Environment saved to " + filename )

            return filename
        } catch ( e ) { dev.log( e ) }
    }
}