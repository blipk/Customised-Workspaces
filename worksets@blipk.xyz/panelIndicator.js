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

//External imports
import St from "gi://St"
import GLib from "gi://GLib"
import GObject from "gi://GObject"
import Clutter from "gi://Clutter"

import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js"
import * as extensionUtils from "resource:///org/gnome/shell/misc/extensionUtils.js"

import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as util from "resource:///org/gnome/shell/misc/util.js"
import * as popupMenu from "resource:///org/gnome/shell/ui/popupMenu.js"
import * as panelMenu from "resource:///org/gnome/shell/ui/panelMenu.js"
import * as boxpointer from "resource:///org/gnome/shell/ui/boxpointer.js"

//Internal imports
import { WorksetsInstance as Me } from "./extension.js"
import * as dev from "./dev.js"
import * as utils from "./utils.js"
import * as uiUtils from "./lib/ui/uiUtils.js"
import * as dialogs from "./lib/ui/dialogs.js"
import * as fileUtils from "./fileUtils.js"

export var WorksetsIndicator = GObject.registerClass( {
    GTypeName: "WorksetsIndicator"
}, class WorksetsIndicator extends panelMenu.Button {
    _init() {
        try {
            super._init( 0.0, "WorksetsIndicator" )
            Me.worksetsIndicator = this

            this.signals = new utils.SignalHandler()

            // Set up menu box to build into
            let hbox = new St.BoxLayout( { style_class: "panel-status-menu-box worksets-indicator-hbox" } )
            this.icon = new St.Icon( { icon_name: "preferences-desktop-workspaces", style_class: "system-status-icon worksets-indicator-icon" } )
            hbox.add_child( this.icon );
            //let buttonText = new St.Label(    {text: (''), y_align: Clutter.ActorAlign.CENTER }   );
            //hbox.add_child(buttonText);
            ( this.add_child ) ? this.add_child( hbox ) : this.actor.add_child( hbox )

            //Build our menu
            this._buildMenu()
            this._refreshMenu()

            this.popUpMenus = []
            this.menu.connect( "menu-closed", () => {
                try {
                    Me.worksetsIndicator.popUpMenus.forEach( pm => {
                        pm.menuItem.isShowing = false
                        pm.destroy()
                    } )
                    Me.worksetsIndicator.popUpMenus = []
                    Me.worksetsIndicator.optionsMenuItem.show()
                } catch ( e ) { dev.log( e ) }
            } )

            this.menu.connect( "open-state-changed", () => {
                try {
                    this._refreshMenu()
                } catch ( e ) { dev.log( e ) }
            } )

            Main.panel.addToStatusArea( "WorksetsIndicator", this, 1 )
        } catch ( e ) { dev.log( e ) }
    }
    destroy() {
        try {
            this.signals.disconnectAll()
            delete this.signals
            super.destroy()
        } catch ( e ) { dev.log( e ) }
    }
    //main UI builder
    _buildOptionsMenuItems() {
        // Sub menu for option switches
        Me.session.activeSession.Options.forEachEntry( function ( optionName, optionValue ) {
            const settingsKeyName = utils.textToKebabCase( optionName )
            const summary = Me.settings.settings_schema.get_key( settingsKeyName ).get_summary()
            const description = Me.settings.settings_schema.get_key( settingsKeyName ).get_description()
            const isBoolOption = typeof Me.session.activeSession.Options[optionName] === "boolean"
            const optionMenuItem = isBoolOption
                ? new popupMenu.PopupSwitchMenuItem( _( summary ), Me.session.activeSession.Options[optionName], { reactive: true } )
                : new popupMenu.PopupSubMenuMenuItem( _( summary ), false )
            optionMenuItem.optionName = optionName
            const toggleOpt = () => {
                // dev.log( `toggle ${optionName} ${this.reopeningMenu}` )
                if ( this.reopeningMenu ) return
                Me.session.activeSession.Options[optionName] = !Me.session.activeSession.Options[optionName]
                Me.session.applySession()
            }
            let apply
            switch ( optionName ) {
            case "IsolateWorkspaces":
                apply = () => { Me.workspaceManager.activateIsolater() }
                break
            case "ReverseMenu":
                apply = () => { toggleOpt(); Me.session.resetIndicator() }
                break
            case "ShowWorkspaceOverly":
                apply = () => { toggleOpt(); Me.workspaceViewManager.refreshOverview() }
                break
            case "CliSwitch":
                apply = () => {
                    const buttonStyles = [
                        {
                            label  : "Cancel",
                            key    : Clutter.KEY_Escape,
                            action : function () { this.close( " " ) }
                        },
                        { label: "Done", default: true }
                    ]
                    const dialogMsg = "Please enter a valid terminal command.\nUse $CWORKSPACE var for the workspace name\nSet empty to not run anything"
                    const getWorksetSwitchCLIArgs = new dialogs.ObjectInterfaceDialog(
                        dialogMsg,
                        ( returnText ) => {
                            if ( !returnText ) return
                            returnText = returnText.trim()
                            if ( returnText === "" ) return
                            Me.session.activeSession.Options["CliSwitch"] = returnText
                            Me.session.applySession()
                            uiUtils.showUserNotification( "CLI command saved." )
                        },
                        true, false, [], [], buttonStyles, Me.session.activeSession.Options["CliSwitch"]
                    )
                }
                break
            default: apply = toggleOpt
            }
            const eventName = isBoolOption ? "toggled" : "button_release_event"
            optionMenuItem.pressHandler = optionMenuItem.connect( eventName, () => { apply() } )
            if ( isBoolOption )
                optionMenuItem.activate = () => { if ( optionMenuItem._switch.mapped ) optionMenuItem.toggle() }
            uiUtils.createTooltip( optionMenuItem, { msg: description, delay: 1400 } )
            this.optionsMenuItems.push( optionMenuItem )
            this.optionsMenuItem.menu.addMenuItem( optionMenuItem )
        }, this )

    }
    _buildMenu() {
        try {
            this.optionsMenuItem = new popupMenu.PopupSubMenuMenuItem( "Extension Options", true )
            this.optionsMenuItem.icon.icon_name = "org.gnome.tweaks"
            this.optionsMenuItems = []
            this._buildOptionsMenuItems()
            this.optionsMenuItem.connect( "button_release_event", () => {
                this.optionsMenuItems.forEach( m => m.destroy() )
                this.optionsMenuItems = []
                this._buildOptionsMenuItems()
            } )


            // Menu sections for workset items
            this.viewSection = new popupMenu.PopupMenuSection()
            // Add separator
            this.ViewSectionSeperator = new popupMenu.PopupSeparatorMenuItem()

            // Default
            this.defaultSection = new popupMenu.PopupMenuSection()

            // Favorites
            this.favoritesSection = new popupMenu.PopupMenuSection()
            this.scrollViewFavoritesMenuSection = new popupMenu.PopupMenuSection()
            let favoritesScrollView = new St.ScrollView( {
                style_class: "ci-history-menu-section", overlay_scrollbars: true
            } )
            favoritesScrollView.add_child( this.favoritesSection.actor )
            this.scrollViewFavoritesMenuSection.actor.add_child( favoritesScrollView )


            // History
            this.historySection = new popupMenu.PopupMenuSection()
            this.scrollViewHistoryMenuSection = new popupMenu.PopupMenuSection()
            let historyScrollView = new St.ScrollView( {
                style_class: "ci-history-menu-section", overlay_scrollbars: true
            } )
            historyScrollView.add_child( this.historySection.actor )
            this.scrollViewHistoryMenuSection.actor.add_child( historyScrollView )

            // Management menu button menu
            let sessionMenuItem = new popupMenu.PopupImageMenuItem( "New Environment", "document-new-symbolic" )
            sessionMenuItem.label.set_x_expand( true )
            this.menu.sessionMenuItem = sessionMenuItem
            sessionMenuItem.connect( "activate", () => { Me.session.newWorkset(); this._refreshMenu() } )

            uiUtils.createIconButton(
                sessionMenuItem,
                "document-save-symbolic",
                () => { Me.session.loadObject(); this._refreshMenu() },
                {}, { msg: "Load a custom workspace from backups" }
            )
            // uiUtils.createIconButton(
            //     sessionMenuItem, 'document-new-symbolic',
            //     () => {Me.session.newWorkset(); this._refreshMenu();},
            //     {}, {msg: "Create new custom workspace"}
            // );

            // Orient menu
            // TODO: Find where Extension.state has moved to
            const reverseMenu = Me.gExtensions.dash2panel()?.state === extensionUtils.ExtensionState.ENABLED
                ? true : Me.session.activeSession.Options.ReverseMenu
            if ( reverseMenu ) {
                this.menu.addMenuItem( this.viewSection )
                this.menu.addMenuItem( this.optionsMenuItem )
                this.menu.addMenuItem( this.ViewSectionSeperator )

                this.menu.addMenuItem( this.defaultSection )
                this.menu.addMenuItem( this.scrollViewFavoritesMenuSection )
                this.menu.addMenuItem( this.scrollViewHistoryMenuSection )
                this.menu.addMenuItem( new popupMenu.PopupSeparatorMenuItem() )

                this.menu.addMenuItem( new popupMenu.PopupSeparatorMenuItem() )
                this.menu.addMenuItem( sessionMenuItem )
            } else {
                this.menu.addMenuItem( sessionMenuItem )
                this.menu.addMenuItem( new popupMenu.PopupSeparatorMenuItem() )

                this.menu.addMenuItem( this.defaultSection )
                this.menu.addMenuItem( this.scrollViewFavoritesMenuSection )
                this.menu.addMenuItem( this.scrollViewHistoryMenuSection )
                this.menu.addMenuItem( new popupMenu.PopupSeparatorMenuItem() )

                this.menu.addMenuItem( this.ViewSectionSeperator )
                this.menu.addMenuItem( this.optionsMenuItem )
                this.menu.addMenuItem( this.viewSection )
            }

        } catch ( e ) { dev.log( e ) }
    }
    //This is run periodically via _refreshMenu()
    _addWorksetMenuItemEntry( workSetsArrayBuffer, worksetIndex ) {
        try {
            let menuItem = new popupMenu.PopupSubMenuMenuItem( "", true )
            menuItem.buttonPressId = menuItem.connect( "button_release_event", () => { this._worksetSubMenuRefresh( menuItem ) } )

            // Connect menu items to worksets array
            menuItem.workset = workSetsArrayBuffer
            menuItem.worksetIndex = worksetIndex
            menuItem.label.text = menuItem.workset.WorksetName

            // Create iconbuttons on MenuItem
            let activeIndex = Me.session.getWorksetActiveIndex( menuItem.workset )
            let icondefault_nameuri = ( Me.session.activeSession.Default == menuItem.workset.WorksetName ) ?
                "starred-symbolic" : ["non-starred-symbolic", "starred-symbolic"]
            let iconOpenNew_nameuri = ( activeIndex > -1 ) ? "window-close-symbolic" : "window-new-symbolic"
            let iconOpenHere_nameuri = ( activeIndex > -1 ) ? "view-reveal-symbolic" : "go-jump-symbolic"
            let openCloseCommand = ( activeIndex > -1 )
                ? () => { Me.session.closeWorkset( menuItem.workset ); this._refreshMenu() }
                : () => { Me.session.displayWorkset( menuItem.workset, true ); this._refreshMenu() }
            let openCloseMsg = ( activeIndex > -1 )
                ? "Disengage '" + menuItem.workset.WorksetName + "'"
                : "Load '" + menuItem.workset.WorksetName + "' in a new workspace"
            let viewOpenMessage = ( activeIndex > -1 )
                ? "Switch to '" + menuItem.workset.WorksetName + "'"
                : "Load '" + menuItem.workset.WorksetName + "' in this workspace"
            uiUtils.createIconButton(
                menuItem, icondefault_nameuri,
                () => { Me.session.setDefaultWorkset( menuItem.workset ); this._refreshMenu(); Me.workspaceViewManager.refreshOverview() },
                true, { msg: "Set '" + menuItem.workset.WorksetName + "' as the default" }
            )
            uiUtils.createIconButton(
                menuItem, "document-edit-symbolic",
                () => { Me.session.editWorkset( menuItem.workset ); this._refreshMenu() },
                {}, { msg: "Edit '" + menuItem.workset.WorksetName + "'" }
            )
            uiUtils.createIconButton( menuItem, iconOpenNew_nameuri, openCloseCommand, {}, { msg: openCloseMsg } )
            // uiUtils.createIconButton(
            //     menuItem, iconOpenHere_nameuri,
            //     () => {Me.session.displayWorkset(menuItem.workset); this._refreshMenu();},
            //     {}, {msg: viewOpenMessage}
            // );

            //Decorate with indicator if active
            menuItem.favAppsMenuItems = []

            //if (activeIndex > -1) {
            let ornamentIcon = new St.BoxLayout( {} )
            menuItem.replace_child( menuItem._ornamentIcon, ornamentIcon )
            let icon = uiUtils.createIconButton(
                ornamentIcon, iconOpenHere_nameuri,
                () => {
                    Me.session.displayWorkset( menuItem.workset ); this._refreshMenu()
                },
                { icon_size: 14 }, { msg: viewOpenMessage }
            )
            icon.translation_x = 3.5

            //Default and currently active always up the top
            let defaultMenuItem, activeMenuItem
            if ( Me.session.activeSession.Default == menuItem.workset.WorksetName ) {
                defaultMenuItem = menuItem
                this.defaultSection.addMenuItem( menuItem, 0 )
                this.defaultSection.moveMenuItem( defaultMenuItem, 0 )
            } else if ( Me.workspaceManager.activeWorksetName == menuItem.workset.WorksetName ) {
                activeMenuItem = menuItem
                this.defaultSection.addMenuItem( menuItem, 0 )
                this.defaultSection.moveMenuItem( activeMenuItem, 1 )
            } else ( activeIndex > -1 )
                ? this.favoritesSection.addMenuItem( menuItem, 0 ) : this.historySection.addMenuItem( menuItem, 0 )

            if ( activeMenuItem )
                this.defaultSection.moveMenuItem( activeMenuItem, 1 )
            if ( defaultMenuItem )
                this.defaultSection.moveMenuItem( defaultMenuItem, 0 )
        } catch ( e ) { dev.log( e ) }
    }
    _worksetSubMenuRefresh( menuItem ) {
        try {
            if ( !menuItem.isShowing ) menuItem.isShowing = false
            let isShowing = menuItem.isShowing

            // Destroy any previous menus
            Me.worksetsIndicator.popUpMenus.forEach( wspopupMenu => {
                if ( wspopupMenu.menuItem.worksetPopupMenu ) wspopupMenu.menuItem.worksetPopupMenu.menu.bye( true )
                wspopupMenu.menuItem.isShowing = false
                wspopupMenu.menuItem._triangle.ease( {
                    rotation_angle_z : 0,
                    duration         : 250,
                    mode             : Clutter.AnimationMode.EASE_OUT_EXPO,
                } )
            }, this )
            Me.worksetsIndicator.popUpMenus = []

            // Area for object info
            menuItem.worksetPopupMenu = new popupMenu.PopupSubMenuMenuItem( "Details for '" + menuItem.workset.WorksetName + "'", true )
            menuItem.worksetPopupMenu.icon.icon_name = "org.gnome.tweaks"
            menuItem.worksetPopupMenu.actor.add_style_class_name( "panel-menu" )
            menuItem.worksetPopupMenu.menuItem = menuItem
            menuItem.worksetPopupMenu.menu.bye = function ( pass = false ) {
                try {
                    Me.worksetsIndicator.popUpMenus.forEach( wspopupMenu => {
                        //Main.uiGroup.remove_child(wspopupMenu.actor);
                        wspopupMenu.menuItem.isShowing = false
                        wspopupMenu.menuItem._triangle.ease( {
                            rotation_angle_z : 0,
                            duration         : 250,
                            mode             : Clutter.AnimationMode.EASE_OUT_EXPO,
                        } )
                        if ( pass ) menuItem.worksetPopupMenu.menu.close( boxpointer.PopupAnimation.FULL )
                        // Wait for the close animation
                        Me.worksetsIndicator.signals.add( GLib.timeout_add( null, 100, function () { wspopupMenu.destroy(); return false } ) )
                        wspopupMenu.menuItem.worksetPopupMenu = null
                    }, this )

                    Me.worksetsIndicator.popUpMenus = []

                    // Wait for the close animation, only if a new view area menu has not been requested
                    if ( !pass ) Me.worksetsIndicator.signals.add(
                        GLib.timeout_add(
                            null, 100, function () {
                                Me.worksetsIndicator.optionsMenuItem.show(); return false
                            }
                        )
                    )

                } catch ( e ) { dev.log( e ) }
            }
            menuItem.worksetPopupMenu.connect( "button_release_event", () => {
                menuItem.worksetPopupMenu.menu.bye()
                return Clutter.SOURCE_REMOVE
                //return Clutter.EVENT_STOP;
            } )
            menuItem.worksetPopupMenu.menu.connect( "menu-closed", () => {
                //menuItem.worksetPopupMenu.menu.bye();
                //return Clutter.EVENT_STOP;
            } )
            menuItem.worksetPopupMenu.menu.connect( "destroy", () => {
                //menuItem.worksetPopupMenu.menu.bye();
                //return Clutter.EVENT_STOP;
            } )
            uiUtils.createIconButton(
                menuItem.worksetPopupMenu, "document-save-symbolic",
                () => { Me.session.saveWorkset( menuItem.workset ); this._refreshMenu() },
                {}, { msg: "Save a backup of '" + menuItem.workset.WorksetName + "'" }
            )

            if ( Me.session.Worksets.length > 1 )
                uiUtils.createIconButton(
                    menuItem.worksetPopupMenu, "user-trash-symbolic",
                    () => { menuItem.worksetPopupMenu.menu.bye(); Me.session.deleteWorkset( menuItem.workset ); this._refreshMenu() },
                    {}, { msg: "Delete '" + menuItem.workset.WorksetName + "' and save a backup" }
                )

            let viewArea = menuItem.worksetPopupMenu.menu
            this.popUpMenus.push( menuItem.worksetPopupMenu )
            viewArea.lastOpen = menuItem

            // Background info
            menuItem.bgMenuButton = new popupMenu.PopupBaseMenuItem( { style_class: "bg-display" } )
            menuItem.bgMenuButton.content_gravity = Clutter.ContentGravity.RESIZE_ASPECT
            const [img, error] = uiUtils.setImage( menuItem.bgMenuButton, Me.session.isDarkMode ? menuItem.workset.BackgroundImageDark : menuItem.workset.BackgroundImage )
            if ( error ) {
                Me.session.isDarkMode ? menuItem.workset.BackgroundImageDark = "" : menuItem.workset.BackgroundImage = ""
                Me.session.applySession()
            }
            viewArea.addMenuItem( menuItem.bgMenuButton )

            let backgroundStyleOptionsBox = new St.BoxLayout( {
                orientation : Clutter.Orientation.VERTICAL,
                reactive    : true,
                track_hover : true,
                x_expand    : true,
                y_expand    : true,
                x_align     : Clutter.ActorAlign.END,
                y_align     : Clutter.ActorAlign.FILL
            } )

            let modeText = Me.session.isDarkMode ? "Dark Mode" : "Light Mode"
            // uiUtils.createTooltip(
            //     menuItem.bgMenuButton,
            //     {msg: "Click to choose a new background image for " + menuItem.workset.WorksetName + " ("+modeText+")"}
            // );

            let backgroundOtherOptionsBox = new St.BoxLayout( {
                orientation : Clutter.Orientation.VERTICAL,
                reactive    : true,
                track_hover : true,
                x_expand    : true,
                y_expand    : true,
                x_align     : Clutter.ActorAlign.START,
                y_align     : Clutter.ActorAlign.CENTER
            } )

            let btnDarkModeIconName = Me.session.isDarkMode ? "night-light-symbolic" : "weather-clear-symbolic"
            let btnDarkMode = uiUtils.createIconButton( backgroundOtherOptionsBox, btnDarkModeIconName, () => {
                try {
                    btnDarkMode.viewingDarkMode = btnDarkMode.icon.icon_name === "night-light-symbolic" ? true : false
                    btnDarkMode.viewingDarkMode = !btnDarkMode.viewingDarkMode
                    btnDarkMode.icon.icon_name = btnDarkMode.viewingDarkMode === true ? "night-light-symbolic" : "weather-clear-symbolic"
                    const [img, error] = uiUtils.setImage(
                        menuItem.bgMenuButton, btnDarkMode.viewingDarkMode === true
                            ? menuItem.workset.BackgroundImageDark : menuItem.workset.BackgroundImage
                    )
                    if ( error ) {
                        btnDarkMode.viewingDarkMode === true ? menuItem.workset.BackgroundImageDark = "" : menuItem.workset.BackgroundImage = ""
                        Me.session.applySession()
                    }
                    modeText = btnDarkMode.viewingDarkMode ? "Dark Mode" : "Light Mode"
                    btnDarkMode.tooltip.msg = "Currently Viewing " + modeText + " background - Click to view/change alternate mode"
                    //menuItem.bgMenuButton.tooltip.msg = "Click to choose a new background image for " + menuItem.workset.WorksetName + " ("+modeText+")"
                    updateIcons()
                } catch ( e ) { dev.log( e ) }
            },
            { x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START },
            { msg: "Currently Viewing " + modeText + " background - Click to view/change alternate mode" } )
            btnDarkMode.viewingDarkMode = Me.session.isDarkMode
            btnDarkMode.disconnect( btnDarkMode.leaveEvent )

            const updateIcons = function () {
                backgroundStyleOptionsBox.iconButtons.forEach( ( iconButton ) => {
                    const backgroundStyleToCompare = btnDarkMode.viewingDarkMode ?
                        menuItem.workset.BackgroundStyleDark : menuItem.workset.BackgroundStyle
                    if ( iconButton.tooltip ) iconButton.style_class =
                        ( iconButton.tooltip.msg.includes( backgroundStyleToCompare.toUpperCase() ) ) ? "active-icon" : "worksets-icon-button"
                } )
            }

            let btnApps = uiUtils.createIconButton(
                backgroundOtherOptionsBox,
                "bookmark-new-symbolic",
                () => {
                    try {
                        Me.session.activeSession.Options.HideAppList = !Me.session.activeSession.Options.HideAppList
                        Me.session.applySession()

                        Me.session.activeSession.Options.HideAppList ? menuItem.infoMenuButton.hide() : menuItem.infoMenuButton.show()
                        menuItem.favAppsMenuItems.forEach( b => Me.session.activeSession.Options.HideAppList ? b.hide() : b.show() )
                        btnApps.tooltip.msg =
                            ( Me.session.activeSession.Options.HideAppList ? "Show" : "Hide" )
                            + " favourite apps for "
                            + menuItem.workset.WorksetName
                    } catch ( e ) { dev.log( e ) }
                },
                { x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.END },
                { msg: ( Me.session.activeSession.Options.HideAppList ? "Show" : "Hide" ) + " favourite apps for " + menuItem.workset.WorksetName }
            )
            btnApps.disconnect( btnApps.leaveEvent )

            menuItem.bgMenuButton.add_child( backgroundOtherOptionsBox )

            menuItem.bgMenuButton.clickSignalId = menuItem.bgMenuButton.connect( "activate", () => {
                Me.session.setWorksetBackgroundImage( menuItem.workset, btnDarkMode.viewingDarkMode )
                this.menu.itemActivated( boxpointer.PopupAnimation.FULL )
            } )

            let updateBackgroundStyle = ( style, menuItem ) => {
                backgroundStyleOptionsBox.iconButtons.forEach( ( iconButton ) => {
                    if ( iconButton.tooltip ) iconButton.style_class = ( iconButton.tooltip.msg.includes( style ) ) ? "active-icon" : "worksets-icon-button"
                } )

                if ( btnDarkMode.viewingDarkMode ) {
                    Me.session.Worksets[menuItem.worksetIndex].BackgroundStyleDark = style
                    menuItem.workset.BackgroundStyleDark = style
                } else {
                    Me.session.Worksets[menuItem.worksetIndex].BackgroundStyle = style
                    menuItem.workset.BackgroundStyle = style
                }

                if ( menuItem.workset.WorksetName == Me.workspaceManager.activeWorksetName
                    || ( Me.workspaceManager.activeWorksetName == "" && menuItem.workset.WorksetName == Me.session.activeSession.Default )
                    && btnDarkMode.viewingDarkMode == Me.session.isDarkMode )
                    Me.session.setBackground(
                        Me.session.isDarkMode ? menuItem.workset.BackgroundImageDark : menuItem.workset.BackgroundImage,
                        Me.session.isDarkMode ? menuItem.workset.BackgroundStyleDark : menuItem.workset.BackgroundStyle
                    )

                Me.session.applySession()
            }

            for ( const wallPaperOption of Me.session.wallPaperOptions )
                uiUtils.createIconButton(
                    backgroundStyleOptionsBox, wallPaperOption.icon,
                    () => { updateBackgroundStyle( wallPaperOption.enum, menuItem ) },
                    {}, { msg: `Set background to '${wallPaperOption.enum}' style` }
                )

            updateIcons()
            menuItem.bgMenuButton.add_child( backgroundStyleOptionsBox )

            Me.session.activeSession.Options.DisableWallpaperManagement ? menuItem.bgMenuButton.hide() : menuItem.bgMenuButton.show()

            // -- Workset info
            let infoText = "Has these favourites"
            Me.session.workspaceMaps.forEachEntry( ( workspaceMapKey, workspaceMapValues, i ) => {
                if ( workspaceMapValues.defaultWorkset == menuItem.workset.WorksetName )
                    infoText += " on the " + utils.stringifyNumber( parseInt( workspaceMapKey.substr( -1, 1 ) ) + 1 ) + " workspace"
            }, this )
            menuItem.infoMenuButton = new popupMenu.PopupImageMenuItem( _( infoText ), "" )
            menuItem.infoMenuButton.label.set_x_expand( true )
            menuItem.infoMenuButton.setOrnament( popupMenu.Ornament.DOT )
            let addApps = () => {
                this.menu.toggle()
                utils.spawnWithCallback(
                    null,
                    [fileUtils.APP_CHOOSER_EXEC(), "-w", menuItem.workset.WorksetName],
                    GLib.get_environ(),
                    0,
                    null,
                    ( resource ) => {
                        try {
                            if ( !resource ) return
                            let newFav = JSON.parse( resource )
                            Me.session.Worksets
                                .filter( w => w.WorksetName == menuItem.workset.WorksetName )[0]
                                .FavApps.push( newFav )
                            Me.session.saveSession()
                            Me.session.setFavorites()
                        } catch ( e ) { dev.log( e ) }
                    }
                )
            }
            uiUtils.createIconButton(
                menuItem.infoMenuButton,
                "list-add-symbolic", addApps,
                {}, { msg: "Add an application to '" + menuItem.workset.WorksetName + "' favourites" }
            )
            menuItem.infoMenuButton.connect( "button_release_event", addApps )
            uiUtils.createTooltip(
                menuItem.infoMenuButton,
                { msg: "Click to select an application to add to '" + menuItem.workset.WorksetName + "' favourites" }
            )
            viewArea.addMenuItem( menuItem.infoMenuButton )

            // Favorite Apps entries
            menuItem.workset.FavApps.forEach( function ( favApp, i ) {
                let { name, displayName, exec, icon } = favApp
                icon = icon || "web-browser-sybmolic"
                menuItem.favAppsMenuItems[i] = new popupMenu.PopupImageMenuItem( _( displayName ), icon )
                menuItem.favAppsMenuItems[i].label.set_x_expand( true )
                uiUtils.createTooltip( menuItem.favAppsMenuItems[i], { msg: "Click to launch '" + displayName + "'" } )
                menuItem.favAppsMenuItems[i].connect( "activate", () => {
                    let [
                        success,
                        argv
                    ] = GLib.shell_parse_argv( exec.replace( "%u", " " ).replace( "%U", " " ) )
                    util.spawn( argv )
                    // To do get pid and use AppSystem to focus window - same with the bgmenu editor
                } )
                uiUtils.createIconButton( menuItem.favAppsMenuItems[i], "edit-delete-symbolic", () => {
                    try {
                        menuItem.favAppsMenuItems[i].destroy()
                        Me.session.removeFavorite( menuItem.workset, name )
                    } catch ( e ) { dev.log( e ) }
                }, {}, { msg: "Remove '" + displayName + "' from '" + menuItem.workset.WorksetName + "' favourites" } )
                viewArea.addMenuItem( menuItem.favAppsMenuItems[i] )
            }, this )

            Me.session.activeSession.Options.HideAppList ? menuItem.infoMenuButton.hide() : menuItem.infoMenuButton.show()
            menuItem.favAppsMenuItems.forEach( b => Me.session.activeSession.Options.HideAppList ? b.hide() : b.show() )

            // -- Enable all switch if nothing to show here
            if ( Me.session.activeSession.Options.HideAppList && Me.session.activeSession.Options.DisableWallpaperManagement ) {
                menuItem.revealButton = new popupMenu.PopupSwitchMenuItem( _( "Show Details" ), false, { reactive: true } )
                menuItem.revealButton.connect( "button_release_event", () => {
                    Me.session.activeSession.Options.HideAppList = false
                    Me.session.activeSession.Options.DisableWallpaperManagement = false
                    Me.session.applySession()
                    menuItem.bgMenuButton.show()
                    menuItem.infoMenuButton.show()
                    menuItem.favAppsMenuItems.forEach( b => b.show() )
                    menuItem.revealButton.hide()
                    //return Clutter.SOURCE_REMOVE;
                    return Clutter.EVENT_STOP
                } )
                menuItem.revealButton.label.set_x_expand( true )
                viewArea.addMenuItem( menuItem.revealButton )
                uiUtils.createTooltip( menuItem.revealButton, { msg: "Reveal background and apps options for " + menuItem.workset.WorksetName } )
            }

            //Main.uiGroup.add_child(menuItem.worksetPopupMenu.actor);
            this.viewSection.addMenuItem( menuItem.worksetPopupMenu )
            if ( isShowing ) {
                menuItem.isShowing = false
                viewArea.bye()
                menuItem._triangle.ease( {
                    rotation_angle_z : 0,
                    duration         : 250,
                    mode             : Clutter.AnimationMode.EASE_OUT_EXPO,
                } )
            } else {
                let angle = ( Me.gExtensions.dash2panelSettings() && Me.gExtensions.dash2panel()?.state === extensionUtils.ExtensionState.ENABLED )
                    ? -90 : 90
                menuItem._triangle.ease( {
                    rotation_angle_z : angle,
                    duration         : 250,
                    mode             : Clutter.AnimationMode.EASE_OUT_EXPO,
                } )
                menuItem.isShowing = true
                viewArea.open( boxpointer.PopupAnimation.FULL )
                menuItem.worksetPopupMenu.show()
                this.optionsMenuItem.hide()
            }
        } catch ( e ) { dev.log( e ) }
    }
    _refreshMenu() {
        try {
            // Me.session.loadSession()

            // Ensure option switches match settings
            this.optionsMenuItems.forEach( function ( menuItem, i ) {
                if ( typeof this.optionsMenuItems[i]._switch !== "undefined" )
                    this.optionsMenuItems[i]._switch.state = Me.session.activeSession.Options[this.optionsMenuItems[i].optionName]
            }, this )

            //Remove all and re-add with any changes
            if ( !utils.isEmpty( Me.session.activeSession ) ) {
                this._worksetMenuItemsRemoveAll()
                Me.session.Worksets.forEach( ( workset, index ) => {
                    this._addWorksetMenuItemEntry( workset, index )
                }, this )

                Me.session.saveSession()
            }
        } catch ( e ) { dev.log( e ) }
    }
    _findRawWorksetByMenuItem( menuItem ) {
        let tmpWorkset = Me.session.Worksets.filter( item => item === menuItem.workset )[0]
        return tmpWorkset
    }
    _worksetMenuItemsGetAll() {
        return this.historySection._getMenuItems().concat( this.favoritesSection._getMenuItems() ).concat( this.defaultSection._getMenuItems() )
    }
    _worksetMenuItemsRemoveAll() {
        this._worksetMenuItemsGetAll().forEach( function ( mItem ) { if ( mItem.destroyIconButtons ) mItem.destroyIconButtons(); mItem.destroy() } )
    }
    _worksetMenuItemMoveToTop( menuItem ) {
        try {
            let index = Me.session.Worksets.findIndex( w => w === menuItem.workset )
            if ( index == -1 ) return
            this._addWorksetMenuItemEntry( Me.session.Worksets[index], index )
            this._refreshMenu()
        } catch ( e ) { dev.log( e ) }
    }
    toggleMenu() {
        this.reopeningMenu = true
        this.menu.toggle()
        this.reopeningMenu = false
    }
} )