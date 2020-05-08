/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) 2020 A.D. - http://kronosoul.xyz
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
const { extensionUtils, util } = imports.misc;
const { extensionSystem, popupMenu, panelMenu, boxpointer } = imports.ui;
const extensionManager = imports.ui.main.extensionManager;
const { GObject, St, Clutter, Gtk } = imports.gi;
const Gettext = imports.gettext;
const Main = imports.ui.main;
const _ = Gettext.domain('worksets').gettext;

//Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { dev, utils, uiUtils, fileUtils } = Me.imports;
const { workspaceManager, workspaceIsolater } = Me.imports;

let ISOLATE_RUNNING      = true;

var WorksetsIndicator = GObject.registerClass({
    GTypeName: 'WorksetsIndicator'
}, class WorksetsIndicator extends panelMenu.Button {
    _init() {
        try {
        super._init(0.0, "WorksetsIndicator");

        //set up menu box to build into
        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box worksets-indicator-hbox' });
        this.icon = new St.Icon({ icon_name: 'tab-new-symbolic', style_class: 'system-status-icon worksets-indicator-icon' });
        hbox.add_child(this.icon);
        //let buttonText = new St.Label(    {text: (''), y_align: Clutter.ActorAlign.CENTER }   );
        //hbox.add_child(buttonText);
        this.actor.add_child(hbox);

        //Build our menu
        this._buildMenu();
        this._refreshMenu()
        } catch(e) { dev.log(e) }    
    }
    _onOpenStateChanged(menu, open) {/*Override from parent class to handle menuitem refresh*/
        this._refreshMenu();
        super._onOpenStateChanged(menu, open);
    }
    //main UI builder
    _buildMenu() {
        try {
        // Isolate running apps switch
        this._onIsolateSwitch(true);
        let isolateRunningAppsMenuItem = new popupMenu.PopupSwitchMenuItem(_("Isolate running applications"), ISOLATE_RUNNING, { reactive: true });
        isolateRunningAppsMenuItem.connect('toggled', this._onIsolateSwitch);
        this.menu.addMenuItem(isolateRunningAppsMenuItem);

        // Add separator
        this.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem());

        // Menu sections for workset items
        // Favorites
        this.favoritesSection = new popupMenu.PopupMenuSection();
        this.scrollViewFavoritesMenuSection = new popupMenu.PopupMenuSection();
        let favoritesScrollView = new St.ScrollView({
            style_class: 'ci-history-menu-section', overlay_scrollbars: true
        });
        favoritesScrollView.add_actor(this.favoritesSection.actor);
        this.scrollViewFavoritesMenuSection.actor.add_actor(favoritesScrollView);
        this.menu.addMenuItem(this.scrollViewFavoritesMenuSection);

        // History
        this.historySection = new popupMenu.PopupMenuSection();
        this.scrollViewHistoryMenuSection = new popupMenu.PopupMenuSection();
        let historyScrollView = new St.ScrollView({
            style_class: 'ci-history-menu-section', overlay_scrollbars: true
        });
        historyScrollView.add_actor(this.historySection.actor);
        this.scrollViewHistoryMenuSection.actor.add_actor(historyScrollView);
        this.menu.addMenuItem(this.scrollViewHistoryMenuSection);

        // Add separator
        this.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem());
        
        // Management menu button menu
        let sessionMenuItem = new popupMenu.PopupImageMenuItem('New Environment', 'document-new-symbolic');
        sessionMenuItem.nameText = "New Environment";
        sessionMenuItem.label.set_x_expand(true);
        this.menu.sessionMenuItem = sessionMenuItem;
        this.menu.addMenuItem(sessionMenuItem);
        
        this._worksetMenuItemSetEntryLabel(sessionMenuItem);
        sessionMenuItem.connect('activate', ()=>{Me.session.newWorkset(); this._refreshMenu();});

        uiUtils.createIconButton(sessionMenuItem, 'document-open-symbolic', () => {Me.session.loadObject(); this._refreshMenu();});
        uiUtils.createIconButton(sessionMenuItem, 'tab-new-symbolic', () => {Me.session.newWorkset(); this._refreshMenu();});

        // Add separator
        this.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem());
        } catch(e) { dev.log(e) }
    }
    //This is run periodically via _refreshMenu()
    _addWorksetMenuItemEntry(workSetsArrayBuffer) {
        try {
        let menuItem = new popupMenu.PopupSubMenuMenuItem('', true);

        // Connect menu items to worksets array
        menuItem.workset = workSetsArrayBuffer;
        menuItem.nameText = menuItem.workset.WorksetName;
        this._worksetMenuItemSetEntryLabel(menuItem);

        menuItem.buttonPressId = menuItem.connect('button_press_event', () => {this._worksetSubMenuRefreh(menuItem);} );
        //menuItem._triangle.connect('button_press_event', () => {this._worksetSubMenuRefreh(menuItem);} );

        // Create iconbuttons on MenuItem
        let isActive = -1;
        Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
            if (workspaceMapValues.currentWorkset == menuItem.workset.WorksetName) {
                isActive = parseInt(workspaceMapKey.substr(-1, 1));
                return;

            }
        }, this);
        let iconfav_nameuri = menuItem.workset.Favorite ? 'starred-symbolic' : 'non-starred-symbolic';
        let iconOpenNew_nameuri = (isActive > -1) ? 'view-reveal-symbolic' : 'list-add-symbolic';
        let iconOpenHere_nameuri = (isActive > -1) ? 'action-unavailable-symbolic' : 'go-jump-symbolic';
        let openHereCommand = (isActive > -1)
             ? () => {Me.session.closeWorkset(menuItem.workset); this._refreshMenu();} 
             : () => {Me.session.displayWorkset(menuItem.workset); this._refreshMenu();};
        uiUtils.createIconButton(menuItem, iconfav_nameuri, () => {this._worksetMenuItemToggleFavorite(menuItem); this._refreshMenu();}, true);
        uiUtils.createIconButton(menuItem, iconOpenHere_nameuri, openHereCommand);
        uiUtils.createIconButton(menuItem, iconOpenNew_nameuri, () => {Me.session.displayWorkset(menuItem.workset, true); this._refreshMenu();});
        uiUtils.createIconButton(menuItem, 'document-save-symbolic', () => {Me.session.saveWorkset(menuItem.workset); this._refreshMenu();});
        uiUtils.createIconButton(menuItem, 'document-edit-symbolic', () => {Me.session.editWorkset(menuItem.workset); this._refreshMenu();});
        uiUtils.createIconButton(menuItem, 'edit-delete-symbolic', () => {Me.session.deleteWorkset(menuItem.workset); this._refreshMenu();});

        // Set up sub menu items
        menuItem.favAppsMenuItems = [];
        if (Me.workspaceManager.activeWorksetName == menuItem.workset.WorksetName) {
            menuItem.setOrnament(popupMenu.Ornament.DOT)
            menuItem.currentlyActive = true;
        } else {
            menuItem.setOrnament(popupMenu.Ornament.NONE)
            menuItem.currentlyActive = false;
        }

        //Add to correct list (favorite/not) and decorate with indicator if active
        menuItem.workset.Favorite ? this.favoritesSection.addMenuItem(menuItem, 0) : this.historySection.addMenuItem(menuItem, 0);

        //_worksetSubMenuRefreh(menuItem) // Running this on SubMenu button_press_event instead as generating the bg image was causing delays
        } catch(e) { dev.log(e) }
    }
    _worksetSubMenuRefreh(menuItem) {
        try {
        // Change name and icon to current default
        //menuItem.icon.icon_name = menuItem.workset.FavApps.icon ? menuItem.workset.FavApps.icon : 'web-browser-symbolic';

        // Remove all and re-add
        menuItem.favAppsMenuItems.forEach(function (mItem) { mItem.destroy(); });
        if (menuItem.infoMenuButton) menuItem.infoMenuButton.destroy();
        menuItem.favAppsMenuItems = [];

        // Background info
        if (menuItem.bgMenuButton == undefined || menuItem.bgMenuButton.imgSrc != menuItem.workset.BackgroundImage) { // Only update if the image has changed
            if (menuItem.bgMenuButton) menuItem.bgMenuButton.destroy();
            menuItem.bgMenuButton = new popupMenu.PopupBaseMenuItem();
            menuItem.bgMenuButton.content_gravity = Clutter.ContentGravity.RESIZE_ASPECT
            menuItem.bgMenuButton.connect('activate', () => {
                //this.menu.close();
                //menuItem.setSubmenuShown(false);
                Me.session.setWorksetBackgroundImage(menuItem.workset);
                this.menu.itemActivated(boxpointer.PopupAnimation.NONE);
            });
            uiUtils.setImage(menuItem.workset.BackgroundImage, menuItem.bgMenuButton)
            menuItem.menu.addMenuItem(menuItem.bgMenuButton);
        }


        // Workset info
        let infoText = "Has these panel favorites";
        Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
            if (workspaceMapValues.defaultWorkset == menuItem.workset.WorksetName)
                infoText += " on the " + utils.stringifyNumber(parseInt(workspaceMapKey.substr(-1, 1))+1) + " workspace";
        }, this);
        menuItem.infoMenuButton = new popupMenu.PopupImageMenuItem(_(infoText), '');
        menuItem.infoMenuButton.label.set_x_expand(true);
        menuItem.infoMenuButton.connect('activate', () => { });
        menuItem.infoMenuButton.setOrnament(popupMenu.Ornament.DOT)
        uiUtils.createIconButton(menuItem.infoMenuButton, 'document-edit-symbolic', () => {{Me.session.editWorkset(menuItem.workset); this._refreshMenu();}});
        menuItem.menu.addMenuItem(menuItem.infoMenuButton);
        
        // Favorite Apps entries
        menuItem.workset.FavApps.forEach(function(favApp, i){
            let {name, displayName, exec, icon} = favApp;
            icon = icon || 'web-browser-sybmolic';
            menuItem.favAppsMenuItems[i] = new popupMenu.PopupImageMenuItem(_(displayName), icon);
            menuItem.favAppsMenuItems[i].label.set_x_expand(true);
            menuItem.favAppsMenuItems[i].connect('activate', () => {
                this._worksetSubMenuRefreh(menuItem)
                menuItem.setSubmenuShown(false);
                menuItem.menu.itemActivated(boxpointer.PopupAnimation.NONE);
            });
            uiUtils.createIconButton(menuItem.favAppsMenuItems[i], 'edit-delete-symbolic', () => {
                try {
                menuItem.favAppsMenuItems[i].destroy();
                Me.session.removeFavorite(menuItem.workset, name);
                } catch(e) { dev.log(e) }
            });
            menuItem.menu.addMenuItem(menuItem.favAppsMenuItems[i]);
        }, this);
        } catch(e) { dev.log(e) }
    }
    _refreshMenu() {
        try {
        Me.session.loadSession();

        //Remove all and re-add with any changes
        if (!utils.isEmpty(Me.session.activeSession)) {
            this._worksetMenuItemsRemoveAll();
            Me.session.activeSession.Worksets.forEach(function (worksetBuffer) {
                this._addWorksetMenuItemEntry(worksetBuffer);
            }, this);

            Me.session.saveSession();
        }
        } catch(e) { dev.log(e) }
    }
    _findRawWorksetByMenuItem(menuItem) {
        let tmpWorkset = Me.session.activeSession.Worksets.filter(item => item === menuItem.workset)[0];
        return tmpWorkset;
    }
    _worksetMenuItemSetEntryLabel(menuItem) {
        menuItem.label.set_text(utils.truncateString(menuItem.nameText));
    }
    _worksetMenuItemsGetAll(text) {
        return this.historySection._getMenuItems().concat(this.favoritesSection._getMenuItems());
    }
    _worksetMenuItemsRemoveAll() {
        this._worksetMenuItemsGetAll().forEach(function (mItem) { mItem.destroy(); });
    }
    _worksetMenuItemMoveToTop(menuItem) {
        try {
        Me.session.activeSession.Worksets.forEach(function (worksetBuffer) {
            if (worksetBuffer === menuItem.workspace) {
                this._addWorksetMenuItemEntry(worksetBuffer);
            }
        }, this);
        this._refreshMenu();
        } catch(e) { dev.log(e) }
    }
    _worksetMenuItemToggleFavorite(menuItem) {
        try {
        Me.session.activeSession.Worksets.forEach(function (worksetBuffer, i) {
            if (worksetBuffer.WorksetName == menuItem.workset.WorksetName) {
                Me.session.activeSession.Worksets[i].Favorite = Me.session.activeSession.Worksets[i].Favorite ? false : true;
            }
        }, this);
        Me.session.saveSession();

        this._worksetMenuItemMoveToTop(menuItem);
        } catch(e) { dev.log(e) }
    }
    _onIsolateSwitch() {
        try {
        ISOLATE_RUNNING = ISOLATE_RUNNING ? false : true;
        
        let findExtensionCompat = function (uuid) {
            if (extensionUtils.extensions)
                uuid = extensionUtils.extensions[uuid]
            else
                uuid = extensionManager.lookup(uuid)
            return uuid;
        };
        
        // Other extensions that implement this behaviours
        let dash2panel = findExtensionCompat('dash-to-panel@jderose9.github.com');
        let dash2dock = findExtensionCompat('dash-to-dock@micxgx.gmail.com');
        let dash2panelSettings, dash2dockSettings;

        if (dash2panel) dash2panelSettings = dash2panel.imports.extension.settings || dash2panel.settings;
        if (dash2dock) dash2dockSettings = dash2dock.imports.extension.dockManager._settings || dash2dock.dockManager._settings;

        if (ISOLATE_RUNNING) {
            if (dash2panel && dash2panelSettings && dash2panel.state === extensionSystem.ExtensionState.ENABLED) {
                if (Me.workspaceIsolater) Me.workspaceIsolater.destroy(); delete Me.workspaceIsolater;
                dash2panelSettings.set_boolean('isolate-workspaces', true);
            } else if (dash2dock && dash2dockSettings && dash2dock.state === extensionSystem.ExtensionState.ENABLED) {
                if (Me.workspaceIsolater) Me.workspaceIsolater.destroy(); delete Me.workspaceIsolater;
                dash2dockSettings.set_boolean('isolate-workspaces', true);
            } else {
                Me.workspaceIsolater = new workspaceIsolater.WorkspaceIsolator();
                workspaceIsolater.WorkspaceIsolator.refresh();
            }
        } else {
            if (dash2panel && dash2panelSettings) dash2panelSettings.set_boolean('isolate-workspaces', false);
            if (dash2dock && dash2dockSettings) dash2dockSettings.set_boolean('isolate-workspaces', false);
            if (Me.workspaceIsolater) Me.workspaceIsolater.destroy(); delete Me.workspaceIsolater;
        }
        } catch(e) { dev.log(e) }
    }
    _toggleMenu(){
        this.menu.toggle();
    }
    _openSettings() {
        util.spawn(["gnome-shell-extension-prefs", Me.uuid]);
    }
});