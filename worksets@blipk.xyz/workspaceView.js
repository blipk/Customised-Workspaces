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

// External imports
import St from "gi://St"
import GLib from "gi://GLib"
import Clutter from "gi://Clutter"

import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as popupMenu from "resource:///org/gnome/shell/ui/popupMenu.js"
import * as overviewControls from "resource:///org/gnome/shell/ui/overviewControls.js"
import * as workspaceThumbnail from "resource:///org/gnome/shell/ui/workspaceThumbnail.js"
import * as workspace from "resource:///org/gnome/shell/ui/workspace.js"
import * as workspaceAnimation from "resource:///org/gnome/shell/ui/workspaceAnimation.js"
import * as workspacesView from "resource:///org/gnome/shell/ui/workspacesView.js"
// import * as layout from "resource:///org/gnome/shell/ui/layout.js"
// import * as overview from "resource:///org/gnome/shell/ui/overview.js"


// Internal imports
import { WorksetsInstance as Me } from "./extension.js"
import * as dev from "./dev.js"
import * as compat from "./compat.js"
import * as utils from "./utils.js"
import * as uiUtils from "./lib/ui/uiUtils.js"
import * as worksetBackgrounds from "./worksetBackgrounds.js"

export class WorkspaceViewManager {
    constructor() {
        try {
            Me.workspaceViewManager = this
            this.injectionHandler = new utils.InjectionHandler()
            this.signals = new utils.SignalHandler()
            this.menus = []
            // Show the wallpapers again when a wallpaper finishes loading in the background (GNOME Shell 51 and later)
            this.backgrounds = new worksetBackgrounds.WorksetBackgrounds( () => {
                this.refreshDesktop()
                this.refreshOverview()
            } )

            this.thumbnailsBox = null
            this.overviewControls = null
            // Overview workspace previews (workspace.Workspace) and workspace switch animation groups
            // (workspaceAnimation.WorkspaceGroup) that exist now, with the ID of their "destroy" handler
            this.gsWorkspaces = new Map()
            this.wsGroups = new Map()
            this.wsvWorkspaces = []
            this.overviewState = 0
            this._refreshingOverview = false
            this._lastAdjustmentValue = -1
            this._lastAdjustmentIntState = -1

            // Keep track of the overview workspace previews so their background can be changed in refreshOverview()
            this.injectionHandler.add(
                workspace.Workspace.prototype, "_init",
                ( originalMethod ) =>
                    function ( metaWorkspace, monitorIndex, overviewAdjustment ) {
                        originalMethod.call( this, metaWorkspace, monitorIndex, overviewAdjustment )
                        Me.workspaceViewManager._trackOverviewWorkspace( this )
                    }
            )

            // Extra reference to the workspace views in the overview of the primary monitor, for the overlays
            this.injectionHandler.add(
                workspacesView.WorkspacesView.prototype, "_init",
                ( originalMethod ) =>
                    function ( monitorIndex, controls, scrollAdjustment, fitModeAdjustment, overviewAdjustment ) {
                        originalMethod.call( this, monitorIndex, controls, scrollAdjustment, fitModeAdjustment, overviewAdjustment )
                        if ( monitorIndex !== Main.layoutManager.primaryIndex )
                            return
                        const workspaces = this._workspaces
                        Me.workspaceViewManager.wsvWorkspaces = workspaces
                        // This handler stays connected after the extension is disabled
                        this.connect( "destroy", () => {
                            if ( Me.workspaceViewManager?.wsvWorkspaces === workspaces )
                                Me.workspaceViewManager.wsvWorkspaces = []
                        } )
                    }
            )

            // Keep track of the workspace switch animation groups, for gestures and switches from the desktop.
            // WorkspaceGroup uses a constructor, thus _createBackground() is the first method that has the workspace.
            // GNOME Shell 47 and earlier have no _createBackground() and make the background in _init().
            this.injectionHandler.add(
                workspaceAnimation.WorkspaceGroup.prototype, compat.workspaceGroupBackgroundMethod,
                ( originalMethod ) =>
                    function ( ...args ) {
                        originalMethod.call( this, ...args )
                        if ( !this._workspace )
                            return
                        const viewManager = Me.workspaceViewManager
                        viewManager._track( viewManager.wsGroups, this )
                        viewManager._refreshWorkspaceGroup( this )
                    }
            )

            this.injectionHandler.add(
                overviewControls.ControlsManager.prototype, "_init",
                ( originalMethod ) =>
                    function () {
                        originalMethod.call( this )
                        Me.workspaceViewManager.overviewControls = this
                        Me.workspaceViewManager.thumbnailsBox = this._thumbnailsBox
                    }
            )

            this.injectionHandler.add(
                workspaceThumbnail.ThumbnailsBox.prototype, "addThumbnails",
                ( originalMethod ) =>
                    function ( start, count ) {
                        originalMethod.call( this, start, count )
                        Me.workspaceViewManager.thumbnailsBox = this
                        Me.workspaceViewManager.refreshOverview()
                    }
            )

            // Re-implementation from earlier shell versions to show the desktop background in the workspace thumbnail
            this.injectionHandler.add(
                workspaceThumbnail.WorkspaceThumbnail.prototype, "_addWindowClone",
                ( originalMethod ) =>
                    function ( win ) {
                        let clone = new workspaceThumbnail.WindowClone( win )
                        clone.connect( "selected", ( o, time ) => { this.activate( time ) } )
                        clone.connect( "drag-begin", () => { Main.overview.beginWindowDrag( clone.metaWindow ) } )
                        clone.connect( "drag-cancelled", () => { Main.overview.cancelledWindowDrag( clone.metaWindow ) } )
                        clone.connect( "drag-end", () => { Main.overview.endWindowDrag( clone.metaWindow ) } )
                        clone.connect( "destroy", () => { this._removeWindowClone( clone.metaWindow ) } )
                        this._contents.add_child( clone )
                        // if ( this._windows.length == 0 ) clone.setStackAbove( this._bgManager.backgroundActor )
                        // else clone.setStackAbove( this._windows[this._windows.length - 1] )

                        if ( this._windows.length > 0 )
                            clone.setStackAbove( this._windows[this._windows.length - 1] )

                        this._windows.push( clone )
                        return clone
                    }
            )

            // GNOME destroys the thumbnails (and their background actors) when the overview is hidden
            /* hidden, hiding, showing */
            this.signals.add( Main.overview, "hidden", () => {
                // P9: Release the wallpapers that the worksets do not use any more
                this.backgrounds.prune( Me.session.Worksets )
                // P17: Reset adjustment state cache for fresh render on next overview open
                this._lastAdjustmentIntState = -1
            } )

            // Run the correct overlay update when the state adjustment hits values in overviewControls.ControlsState
            this.signals.add( Main.overview._overview._controls._stateAdjustment, "notify::value", ( adjustment ) => {
                const value = adjustment.value
                const intValue = Math.floor( value )
                const valueDecimal = value - intValue

                const ascending = value > this._lastAdjustmentValue
                this._lastAdjustmentValue = value

                if ( value > 1 && value < 2 ) {
                    if ( ascending ) { // Entering into AppGrid overview
                        if ( valueDecimal > 0.3 ) return
                        Me.workspaceViewManager.refreshOverview( 2 )
                    } else {
                        if ( valueDecimal < 0.7 ) return
                        Me.workspaceViewManager.refreshOverview( 2 )
                    }
                    return
                } else if ( value > intValue )
                    return

                if ( intValue === this._lastAdjustmentIntState ) return
                this._lastAdjustmentIntState = intValue

                Me.workspaceViewManager.refreshOverview( intValue )
            } )
            // This is needed in addition to above to ensure the correct starting overlay state with gestures
            this.injectionHandler.add(
                overviewControls.ControlsManager.prototype, "gestureBegin",
                ( originalMethod ) =>
                    function ( tracker ) {
                        originalMethod.call( this, tracker )
                        Me.workspaceViewManager.refreshOverview( 2 )
                    }
            )

            // GNOME makes the overview before the extension is enabled, and the overview can be visible
            // already (for example at login). Start with the overview actors that exist now.
            this._adoptOverviewActors()
            this.refreshOverview()
        } catch ( e ) { dev.log( e ) }
    }

    /** Starts to track the overview actors that GNOME made before the extension was enabled. */
    _adoptOverviewActors() {
        const controls = Main.overview._overview?.controls
        if ( !controls ) return

        this.overviewControls = controls
        this.thumbnailsBox = controls._thumbnailsBox ?? null

        const workspacesDisplay = controls._workspacesDisplay
        const views = workspacesDisplay?._workspacesViews ?? []
        // The primary monitor has a WorkspacesView, other monitors have a SecondaryMonitorDisplay that contains one
        views.forEach( ( view ) => {
            for ( const gsWorkspace of view._workspaces ?? view._workspacesView?._workspaces ?? [] )
                this._trackOverviewWorkspace( gsWorkspace )
        } )
        this.wsvWorkspaces = views[workspacesDisplay._primaryIndex]?._workspaces ?? []
    }

    /**
     * Records an overview workspace preview, so that refreshOverview() can show the workset wallpaper in it.
     * @param {Clutter.Actor} gsWorkspace - A workspace.Workspace
     */
    _trackOverviewWorkspace( gsWorkspace ) {
        const bgManager = gsWorkspace._background?._bgManager
        this._track( this.gsWorkspaces, gsWorkspace, () => this.backgrounds.restore( bgManager ) )
    }

    destroy() {
        try {
            this.menus.forEach( menu => { try { menu.destroy() } catch ( e ) { /* already destroyed */ } } )
            this.menus = []

            this.injectionHandler.removeAll()
            this.signals.disconnectAll()

            // Remove everything that the extension added to GNOME actors, and put the GNOME wallpapers back
            this.clearWorksetBackgrounds()
            this.backgrounds.destroy()
            this.thumbnailBoxes.forEach( thumbnailBox => this._removeThumbnailLabel( thumbnailBox ) )
            this.wsvWorkspaces.forEach( view => this._removeOverlay( view ) )
            for ( const trackedActors of [this.gsWorkspaces, this.wsGroups] ) {
                for ( const [actor, destroyId] of trackedActors )
                    actor.disconnect( destroyId )
                trackedActors.clear()
            }

            delete this.injectionHandler
            delete this.signals
        } catch ( e ) { dev.log( e ) }
    }

    /** The workspace thumbnails at the top of the overview. GNOME makes a new array each time the overview is shown. */
    get thumbnailBoxes() {
        return this.thumbnailsBox?._thumbnails ?? []
    }

    refreshThumbnailBoxes() {
        try {
            if ( this.thumbnailsBox ) this.thumbnailsBox.addThumbnails()
            this.refreshOverview()
        } catch ( e ) { dev.log( e ) }
    }

    /**
     * Records a GNOME actor in a map until the actor is destroyed.
     * @param {Map<Clutter.Actor, number>} trackedActors - The map, from actor to the ID of its "destroy" handler
     * @param {Clutter.Actor} actor - The actor to record
     * @param {function(): void} [onDestroy] - Called when the actor is destroyed
     */
    _track( trackedActors, actor, onDestroy = null ) {
        if ( trackedActors.has( actor ) ) return
        trackedActors.set( actor, actor.connect( "destroy", () => {
            trackedActors.delete( actor )
            onDestroy?.()
        } ) )
    }

    /** Removes the workset wallpapers from the overview and from the desktop, and puts the GNOME wallpapers back. */
    clearWorksetBackgrounds() {
        try {
            for ( const wsGroup of this.wsGroups.keys() )
                this.backgrounds.removeOwnActor( wsGroup )
            this.thumbnailBoxes.forEach( thumbnailBox => this.backgrounds.removeOwnActor( thumbnailBox ) )
            this.backgrounds.restoreAll()
        } catch ( e ) { dev.log( e ) }
    }

    get _wallpaperManagementDisabled() {
        return Me.session.activeSession.Options.DisableWallpaperManagement
    }

    /**
     * Finds the workset that is active on a workspace.
     * @param {number} workspaceIndex - Index of the workspace
     * @returns {object|undefined} The workset, or undefined if no workset is active on the workspace
     */
    _worksetForWorkspace( workspaceIndex ) {
        const workspaceMap = Me.session.workspaceMaps["Workspace" + workspaceIndex]
        if ( !workspaceMap ) return undefined
        return Me.session.Worksets.find( ( wset ) => wset.WorksetName == workspaceMap.currentWorkset )
    }

    /**
     * Gets the wallpaper for a workspace. A workspace without an active workset shows the
     * wallpaper of the default workset, the same as the desktop does.
     * @param {number} workspaceIndex - Index of the workspace
     * @returns {Meta.Background|null} The wallpaper, or null if it is not loaded yet
     */
    _backgroundForWorkspace( workspaceIndex ) {
        const workset = this._worksetForWorkspace( workspaceIndex ) ?? Me.session.DefaultWorkset
        return this.backgrounds.forWorkset( workset, Me.session.isDarkMode )
    }

    refreshDesktop() {
        try {
            for ( const wsGroup of this.wsGroups.keys() )
                this._refreshWorkspaceGroup( wsGroup )
        } catch ( e ) { dev.log( e ) }
    }

    /**
     * Shows the workset wallpaper in a workspace switch animation group.
     * @param {Clutter.Actor} wsGroup - A workspaceAnimation.WorkspaceGroup
     */
    _refreshWorkspaceGroup( wsGroup ) {
        try {
            const container = wsGroup._background
            const metaWorkspace = wsGroup.workspace ?? wsGroup._workspace
            const background = !this._wallpaperManagementDisabled && container && metaWorkspace
                ? this._backgroundForWorkspace( metaWorkspace.index() )
                : null

            if ( !background ) {
                this.backgrounds.removeOwnActor( wsGroup )
                return
            }

            // Above the GNOME wallpaper, so that GNOME can replace its wallpaper below it during the animation,
            // and below the desktop windows (for example desktop icons)
            this.backgrounds.showInOwnActor( wsGroup, container, background, {
                monitorIndex : wsGroup._monitor.index,
                siblingBelow : container._bgManager?.backgroundActor?.get_parent() ?? null,
            } )
        } catch ( e ) { dev.log( e ) }
    }

    refreshOverview( overviewState = overviewControls.ControlsState.WINDOW_PICKER ) {
        try {
            if ( !Main.overview._visible ) return

            // P1: Re-entrancy guard to prevent recursive calls
            if ( this._refreshingOverview ) return
            this._refreshingOverview = true

            try {
                const wallpaperManagementDisabled = this._wallpaperManagementDisabled

                this.thumbnailBoxes.forEach( ( thumbnailBox, i ) => {
                    // Find active workset for thumbnailbox
                    thumbnailBox._workset = this._worksetForWorkspace( i )

                    // Thumbnail label
                    if ( ( !Me.session.activeSession.Options.ShowOverlayThumbnailLabels || !thumbnailBox._workset ) && thumbnailBox.worksetLabel ) {
                        // P35: Guard remove_child with parent check
                        if ( thumbnailBox.worksetLabel.get_parent() === thumbnailBox )
                            thumbnailBox.remove_child( thumbnailBox.worksetLabel )
                    }

                    if ( thumbnailBox._workset && Me.session.activeSession.Options.ShowOverlayThumbnailLabels ) {
                        thumbnailBox.worksetLabel ||= new St.Label( {
                            style_class : "workspace-preview-label",
                            x_align     : Clutter.ActorAlign.END, x_expand    : false,
                            y_align     : Clutter.ActorAlign.END, y_expand    : false,
                        } )
                        thumbnailBox.worksetLabel.set_text( thumbnailBox._workset.WorksetName )

                        // P35: Only add_child if not already a child
                        if ( !thumbnailBox.worksetLabel.get_parent() )
                            thumbnailBox.add_child( thumbnailBox.worksetLabel )
                    }

                    // Thumbnail background. GNOME does not show wallpapers in the thumbnails, so the actor is our own.
                    // Do not show wallpapers in the overview when wallpaper management is disabled (#70)
                    const background = wallpaperManagementDisabled ? null : this._backgroundForWorkspace( i )
                    if ( background ) {
                        const monitor = Main.layoutManager.monitors[thumbnailBox.monitorIndex] ?? Main.layoutManager.primaryMonitor
                        // The thumbnail contents use stage coordinates, and the window clones must be above the wallpaper
                        this.backgrounds.showInOwnActor( thumbnailBox, thumbnailBox._contents, background, {
                            monitorIndex : monitor.index,
                            x            : monitor.x,
                            y            : monitor.y,
                            atBottom     : true,
                        } )
                    } else {
                        this.backgrounds.removeOwnActor( thumbnailBox )
                    }

                    this.updateOverlay( overviewState, thumbnailBox._workset, i )
                } )

                // Overview workspace previews. These actors belong to GNOME, so the GNOME wallpaper is recorded to put back later.
                for ( const gsWorkspace of this.gsWorkspaces.keys() ) {
                    const bgManager = gsWorkspace._background?._bgManager
                    const workspaceIndex = gsWorkspace.metaWorkspace?.index()
                    if ( !bgManager || workspaceIndex === undefined ) continue

                    const background = wallpaperManagementDisabled ? null : this._backgroundForWorkspace( workspaceIndex )
                    if ( background )
                        this.backgrounds.override( bgManager, background )
                    else
                        this.backgrounds.restore( bgManager )
                }
            } finally {
                this._refreshingOverview = false
            }

        } catch ( e ) { dev.log( e ) }
    }

    _removeThumbnailLabel( thumbnailBox ) {
        thumbnailBox.worksetLabel?.destroy()
        thumbnailBox.worksetLabel = null
    }

    _removeOverlay( view ) {
        view._worksetOverlayBox?.destroy()
        view._worksetOverlayBox = null
    }

    updateOverlay( overviewState, workset, i ) {
        try {
            const view = this.wsvWorkspaces[i]
            if ( !view ) return

            // Delete old overlay box and rebuild
            this._removeOverlay( view )

            // Stop after background change if overlay box is not enabled
            if ( !Me.session.activeSession.Options.ShowWorkspaceOverlay )
                return

            // Global box
            view._worksetOverlayBox = new St.BoxLayout( {
                style_class : "workspace-overlay",
                x_align     : Clutter.ActorAlign.FILL, x_expand    : true,
                y_align     : Clutter.ActorAlign.FILL, y_expand    : true,
            } )
            view.add_child( view._worksetOverlayBox )

            // Label text
            let worksetLabel = new St.Label( {
                style_class : "workset-label",
                x_align     : Clutter.ActorAlign.START, x_expand    : true,
                y_align     : Clutter.ActorAlign.START, y_expand    : true,
            } )
            worksetLabel.set_text( workset?.WorksetName || "" )
            view._worksetOverlayBox.add_child( worksetLabel )

            if ( overviewState >= overviewControls.ControlsState.APP_GRID )
                return

            // Icon buttons
            let iconsBox = new St.BoxLayout( {
                x_align  : Clutter.ActorAlign.END, x_expand : true,
                y_align  : Clutter.ActorAlign.START, y_expand : false,
            } )
            view._worksetOverlayBox.add_child( iconsBox )

            let iconOptions = {
                style_class: "overlay-icon", icon_size: 24
            }

            // Button to access panel menu, if it is disabled
            if ( !Me.session.activeSession.Options.ShowPanelIndicator )
                uiUtils.createIconButton( iconsBox, "emblem-system-symbolic", () => {
                    Me.session.activeSession.Options.ShowPanelIndicator ? Me.worksetsIndicator.toggleMenu() : null
                    Me.session.activeSession.Options.ShowPanelIndicator = true
                    Me.session.applySession()
                }, iconOptions, { msg: "Customised Workspaces options menu" } )

            // Action buttons for custom workspaces
            if ( workset ) {
                uiUtils.createIconButton( iconsBox, "document-edit-symbolic", () => {
                    Me.session.editWorkset( workset )
                }, iconOptions, { msg: "Edit '" + workset.WorksetName + "'" } )
                uiUtils.createIconButton( iconsBox, "image-x-generic-symbolic", () => {
                    Me.session.setWorksetBackgroundImage( workset, Me.session.isDarkMode )
                }, iconOptions, { msg: "Change the background for '" + workset.WorksetName + "'" } )
                uiUtils.createIconButton( iconsBox, "window-close-symbolic", () => {
                    Me.session.closeWorkset( workset ); Me.workspaceViewManager.refreshThumbnailBoxes()
                }, iconOptions, { msg: "Disengage '" + workset.WorksetName + "'" } )
            }

            // Image for empty workspace thumbnail
            if ( !workset /* && Me.workspaceManager.NumGlobalWorkspaces == i+1 */ ) {
                uiUtils.createIconButton( iconsBox, "document-new-symbolic", () => {
                    Me.workspaceManager.switchToWorkspace( i ); Me.session.newWorkset( null, true, true )
                }, iconOptions, { msg: "Create new custom workspace here" } )

                let btn = uiUtils.createIconButton( iconsBox, "go-jump-symbolic", () => {
                    try {
                        if ( btn.menu ) return btn.menu.bye()

                        btn.menu = new popupMenu.PopupMenu( btn, Clutter.ActorAlign.START, St.Side.TOP )
                        this.menus.push( btn.menu )
                        btn.menu.bye = function () {
                            Main.uiGroup.remove_child( btn.menu.actor )
                            btn.menu.actor.hide()
                            btn.menu.destroy()
                            btn.menu = null
                            return true
                        }

                        let menuItems = []
                        let defaultMenuItem
                        Me.session.Worksets.forEach( function ( workset, ii ) {
                            // Don't show active worksets
                            let activeIndex = Me.session.getWorksetActiveIndex( workset )
                            if ( activeIndex > -1 ) return

                            let menuItem = new popupMenu.PopupMenuItem( "" )
                            menuItems.push( menuItem )
                            if ( workset.WorksetName == Me.session.DefaultWorkset.WorksetName ) defaultMenuItem = menuItem
                            menuItem._workset = workset
                            menuItem.label.set_text( menuItem._workset.WorksetName )

                            menuItem.buttonPressId = menuItem.connect( "button-press-event", () => {
                                Me.workspaceManager.loadDefaults = false
                                Me.workspaceManager.noUpdate = true
                                Me.workspaceManager.switchToWorkspace( i )
                                Me.session.displayWorkset( workset )
                                // Something is switching to the last workspace after this menu is destroyed
                                // This is my hack to make sure we stay on the right one
                                this.signals.add( GLib.timeout_add( null, 230, () => {
                                    Me.workspaceManager.switchToWorkspace( i )
                                    Me.workspaceManager.loadDefaults = true
                                    Me.workspaceManager.noUpdate = false
                                    Me.workspaceManager._workspaceUpdate()
                                    return false
                                } ) )
                                btn.menu.bye()
                            } )

                            if ( Me.session.activeSession.Default == menuItem._workset.WorksetName )
                                btn.menu.defaultItem = menuItem._workset.WorksetName

                            menuItem.setOrnament( popupMenu.Ornament.NONE )
                            btn.menu.addMenuItem( menuItem, 0 )
                        }, this )

                        // Move the active workset to the top
                        if ( !utils.isEmpty( defaultMenuItem ) ) {
                            btn.menu.moveMenuItem( defaultMenuItem, 0 )
                            defaultMenuItem.setOrnament( popupMenu.Ornament.DOT )
                        }

                        // If no inactive worksets for the menu, add an option to create
                        if ( menuItems.length == 0 ) {
                            let menuItem = new popupMenu.PopupMenuItem( "" )
                            menuItems.push( menuItem )
                            menuItem.label.set_text( "Create New Workspace Here" )
                            menuItem.buttonPressId = menuItem.connect( "button-press-event", () => {
                                Me.workspaceManager.switchToWorkspace( i ); Me.session.newWorkset( null, true, true )
                                btn.menu.bye()
                            } )
                            menuItem.setOrnament( popupMenu.Ornament.NONE )
                            btn.menu.addMenuItem( menuItem, 0 )
                        }

                        Main.uiGroup.add_child( btn.menu.actor )
                        this.signals.add( GLib.timeout_add( null, 5000, () => { if ( !utils.isEmpty( btn.menu ) ) btn.menu.bye(); return false } ) )
                        btn.menu.open()
                    } catch ( e ) { dev.log( e ) }
                }, iconOptions, { msg: "Choose a custom workspace to load here" } )
                btn.connect( "destroy", () => { if ( btn.menu ) btn.menu.bye() } )
            }

        } catch ( e ) { dev.log( e ) }
    }
}