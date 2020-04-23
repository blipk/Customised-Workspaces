/*
 * Worksets extension for Gnome 3
 * This file is part of the worksets extension for Gnome 3
 * Copyright (C) 2020 A.D. - http://blipk.xyz
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope this it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * 
 * Credits:
 * This extension was created by using the following gnome-shell extensions
 * as a source for code and/or a learning resource
 * - dash-to-panel@jderose9.github.com.v16.shell-extension
 * - clipboard-indicator@tudmotu.com
 * - workspaces-to-dock@passingthru67.gmail.com
 * - workspace-isolated-dash@n-yuki.v14.shell-extension
 * - historymanager-prefix-search@sustmidown.centrum.cz
 * - minimum-workspaces@philbot9.github.com.v9.shell-extension
 * 
 * Many thanks to those great extensions.
 */

//External imports
const { extensionUtils, util } = imports.misc;
const { extensionSystem, popupMenu, panelMenu } = imports.ui;
const { GObject, St, Clutter } = imports.gi;
const Gettext = imports.gettext;
const Main = imports.ui.main;
const _ = Gettext.domain('worksets').gettext;

//Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const utils = Me.imports.utils;
const workspaceManager = Me.imports.workspaceManager;
const workspaceIsolater = Me.imports.workspaceIsolater;
const fileUtils = Me.imports.fileUtils;
const uiUtils = Me.imports.uiUtils;
const dev = Me.imports.devUtils;
const scopeName = "panelIndicator";

const INDICATOR_ICON = 'tab-new-symbolic';
let ISOLATE_RUNNING      = false;
let MAX_ENTRY_LENGTH     = 50;

//TO DO implement the workspace isolater
var WorksetsIndicator = GObject.registerClass({
    GTypeName: 'WorksetsIndicator'
}, class WorksetsIndicator extends panelMenu.Button {
    destroy() {
        try {
        if (Me.workspaceIsolater) {
            Me.workspaceIsolater.destroy();
            workspaceIsolater.WorkspaceIsolator.refresh();
            delete Me.workspaceIsolater;
        }
        super._onDestroy();
        delete Main.panel.statusArea['WorksetsIndicator'];
        } catch(e) { dev.log(e) }
    }
    _init() {
        try {
        super._init(0.0, "WorksetsIndicator");

        //set up menu box to build into
        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box worksets-indicator-hbox' });
        this.icon = new St.Icon({ icon_name: INDICATOR_ICON, style_class: 'system-status-icon worksets-indicator-icon' });
        hbox.add_child(this.icon);
        //let buttonText = new St.Label(    {text: (''), y_align: uiUtils.Clutter.ActorAlign.CENTER }   );
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
        let isolateRunningAppsMenuItem = new popupMenu.PopupSwitchMenuItem(_("Isolate running applications"), ISOLATE_RUNNING, { reactive: true });
        isolateRunningAppsMenuItem.connect('toggled', this._onIsolateSwitch);
        this.menu.addMenuItem(isolateRunningAppsMenuItem);

        // Add 'Settings' menu item to open settings
        //let settingsMenuItem = new popupMenu.PopupMenuItem(('Settings'));
        //this.menu.addMenuItem(settingsMenuItem);
        //settingsMenuItem.connect('activate', Lang.bind(this, this._openSettings));

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
        let sessionMenuItem = new popupMenu.PopupSubMenuMenuItem((''));
        sessionMenuItem.nameText = "Manage";
        this.menu.sessionMenuItem = sessionMenuItem;
        this.menu.addMenuItem(sessionMenuItem);
        
        this._worksetMenuItemSetEntryLabel(sessionMenuItem);
        sessionMenuItem.connect('activate', ()=>{Me.session.showObjectManager()});

        uiUtils.createIconButton(sessionMenuItem, 'document-open-symbolic', () => {Me.session.loadObject(); this._refreshMenu();});
        uiUtils.createIconButton(sessionMenuItem, 'document-properties-symbolic', () => {Me.session.showObjectManager(); this._refreshMenu();});
        uiUtils.createIconButton(sessionMenuItem, 'tab-new-symbolic', () => {Me.session.newObject(); this._refreshMenu();});

        
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
        menuItem.favoriteState = menuItem.workset.Favorite;
        menuItem.nameText = menuItem.workset.WorksetName;

        // Connect menuitem and its iconbuttons
        // TO DO
        menuItem.buttonPressId = menuItem.connect('activate', () => {this._worksetMenuItemsOnMenuSelected(menuItem);} );
        menuItem.buttonPressId = menuItem.connect('button_press_event', () => {this._worksetSubMenuRefreh(menuItem);} );

        this._worksetMenuItemSetEntryLabel(menuItem);
        // Create iconbuttons on MenuItem
        let iconfav_nameuri = menuItem.favoriteState ? 'starred-symbolic' : 'non-starred-symbolic';
        let iconOpenNew_nameuri = (Me.workspaceManager.activeWorksetName == menuItem.workset.WorksetName) ? 'go-last-symbolic' : 'list-add-symbolic';
        uiUtils.createIconButton(menuItem, iconfav_nameuri, () => {this._worksetMenuItemToggleFavorite(menuItem); this._refreshMenu();}, true);
        uiUtils.createIconButton(menuItem, iconOpenNew_nameuri, () => {Me.session.displayWorkset(menuItem.workset, true); this._refreshMenu();});
        uiUtils.createIconButton(menuItem, 'document-save-symbolic', () => {Me.session.saveWorkset(menuItem.workset); this._refreshMenu();});

        uiUtils.createIconButton(menuItem, 'document-properties-symbolic', () => {
            let editObjectChooseDialog = new uiUtils.ObjectEditorDialog("Properties of Workset: "+menuItem.nameText, () => {
                uiUtils.showUserFeedbackMessage("Changes saved.");
            }, menuItem.workset, [{WorksetName: 'Workset Name'}, {DefaultWorkspaceIndex: 'Load on workspace X by default'}, {Favorite: 'Favorite'}]);
        });

        uiUtils.createIconButton(menuItem, 'edit-delete-symbolic', () => {this._worksetMenuItemRemoveEntry(menuItem, 'delete'); this._refreshMenu();});

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
        menuItem.favoriteState ? this.favoritesSection.addMenuItem(menuItem, 0) : this.historySection.addMenuItem(menuItem, 0);

        //_worksetSubMenuRefreh(menuItem) // Running this on SubMenu button_press_event instead as generating the bg image was causing delays
        } catch(e) { dev.log(e) }
    }
    _worksetSubMenuRefreh(menuItem) {
        // Change name and icon to current default
        //menuItem.icon.icon_name = menuItem.workset.FavApps.icon ? menuItem.workset.FavApps.icon : 'web-browser-symbolic';

        // Remove all and re-add
        menuItem.favAppsMenuItems.forEach(function (mItem) { mItem.destroy(); });
        if (menuItem.infoMenuButton) menuItem.infoMenuButton.destroy();
        if (menuItem.bgMenuButton) menuItem.bgMenuButton.destroy();
        menuItem.favAppsMenuItems = [];

        // Background info
        menuItem.bgMenuButton = new popupMenu.PopupBaseMenuItem();
        menuItem.bgMenuButton.content_gravity = Clutter.ContentGravity.RESIZE_ASPECT
        menuItem.bgMenuButton.connect('activate', () => {
            menuItem.setSubmenuShown(false);
            Me.session.setWorksetBackgroundImage(menuItem.workset);
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
        });
        uiUtils.setImage(menuItem.workset.BackgroundImage, menuItem.bgMenuButton)
        menuItem.menu.addMenuItem(menuItem.bgMenuButton);

        // Workset info
        let infoText = "Opens these apps";
        Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
            if (workspaceMapValues.defaultWorkset == menuItem.workset.WorksetName)
                infoText += " on workspace " + workspaceMapKey.substr(-1, 1);
        }, this);
        menuItem.infoMenuButton = new popupMenu.PopupImageMenuItem(_(infoText+":"), "bowser");
        menuItem.infoMenuButton.connect('activate', () => {
            this.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
        });
        menuItem.infoMenuButton.setOrnament(popupMenu.Ornament.DOT)
        //uiUtils.createIconButton(menuItem.infoMenuButton, 'web-browser-sybmolic', () => {});
        menuItem.menu.addMenuItem(menuItem.infoMenuButton);
        
        // Favorite Apps entries
        menuItem.workset.FavApps.forEach(function(favApp, i){
            let {name, displayName, exec, icon} = favApp;
            icon = icon || 'web-browser-sybmolic';
            menuItem.favAppsMenuItems[i] = new popupMenu.PopupImageMenuItem(_(displayName), icon);
            menuItem.favAppsMenuItems[i].connect('activate', () => {
                this._worksetSubMenuRefreh(menuItem)
                menuItem.setSubmenuShown(false);
                menuItem.menu.itemActivated(BoxPointer.PopupAnimation.NONE);
            });
            menuItem.menu.addMenuItem(menuItem.favAppsMenuItems[i]);
        }, this);
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
            this.menu.sessionMenuItem.nameText = Me.session.activeSession.SessionName + " Session";
            this._worksetMenuItemSetEntryLabel(this.menu.sessionMenuItem);

            Me.session.saveSession();
        }
        } catch(e) { dev.log(e) }
    }
    _findRawWorksetByMenuItem(menuItem) {
        let tmpWorkset = Me.session.activeSession.Worksets.filter(item => item === menuItem.workset)[0];
        return tmpWorkset;
    }
    _worksetMenuItemSetEntryLabel(menuItem) {
        menuItem.label.set_text(utils.truncateString(menuItem.nameText, MAX_ENTRY_LENGTH));
    }
    _worksetMenuItemsGetAll(text) {
        return this.historySection._getMenuItems().concat(this.favoritesSection._getMenuItems());
    }
    _worksetMenuItemsRemoveAll() {
        this._worksetMenuItemsGetAll().forEach(function (mItem) { mItem.destroy(); });
    }
    _worksetMenuItemRemoveEntry(menuItem, event) {
        try {
        if(event === 'delete') {
            let backupFilename = Me.session.saveWorkset(menuItem.workset, true);
            Me.session.activeSession.Worksets = Me.session.activeSession.Worksets.filter(item => item !== menuItem.workset)
            this._refreshMenu();
            menuItem.destroy();
            uiUtils.showUserFeedbackMessage("Workset removed from session and backup saved to "+backupFilename, true);
        }
        } catch(e) { dev.log(e) }
    }
    _worksetMenuItemMoveToTop(menuItem) {
        try {
        this._worksetMenuItemRemoveEntry(menuItem);
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
        menuItem.favoriteState = menuItem.favoriteState ? false : true;

        Me.session.activeSession.Worksets.forEach(function (worksetBuffer, i) {
            if (worksetBuffer === menuItem.workset) {
                Me.session.activeSession.Worksets[i].Favorite = menuItem.favoriteState;
            }
        }, this);

        this._worksetMenuItemMoveToTop(menuItem);
        } catch(e) { dev.log(e) }
    }
    _worksetMenuItemsOnMenuSelected(menuItem, close=false) {
        try {
        //Turn off all others
        this._worksetMenuItemsGetAll().forEach(function (mItem) {
            mItem.currentlyActive = false; mItem.setOrnament(popupMenu.Ornament.NONE);
        }, this);

        //Toggle current in UI
        menuItem.currentlyActive ? menuItem.setOrnament(popupMenu.Ornament.NONE) : menuItem.setOrnament(popupMenu.Ornament.DOT);
        menuItem.currentlyActive = menuItem.currentlyActive ? false : true;

        //Activate selected workset
        Me.session.displayWorkset(menuItem.workset);
        this._refreshMenu();

        if (close) {this.menu.close();}
        } catch(e) { dev.log(e) }
    }
    _onIsolateSwitch(init=false) {
        try {
        ISOLATE_RUNNING = ISOLATE_RUNNING ? false: true;

        let dash2panel = extensionUtils.extensions['dash-to-panel@jderose9.github.com'];
        let dash2dock = extensionUtils.extensions['dash-to-dock@micxgx.gmail.com'];
        let dash2panelSettings, dash2dockSettings;
        if (dash2panel) dash2panelSettings = dash2panel.imports.extension.settings;
        if (dash2dock) dash2dockSettings = dash2dock.imports.extension.dockManager._settings;

        if (ISOLATE_RUNNING) {
            if (dash2panel && dash2panelSettings && dash2panel.state === extensionSystem.ExtensionState.ENABLED) {
                dash2panelSettings.set_boolean('isolate-workspaces', true);
            } else if (dash2dock && dash2dockSettings && dash2dock.state === extensionSystem.ExtensionState.ENABLED) {
                dash2dockSettings.set_boolean('isolate-workspaces', true);
            } else {
                Me.workspaceIsolater = new workspaceIsolater.WorkspaceIsolator();
                workspaceIsolater.WorkspaceIsolator.refresh();
            }
        } else {
            if (dash2panel && dash2panelSettings) dash2panelSettings.set_boolean('isolate-workspaces', false);
            if (dash2dock && dash2dockSettings) dash2dockSettings.set_boolean('isolate-workspaces', false);
            if (Me.workspaceIsolater) {
                Me.workspaceIsolater.destroy();
                workspaceIsolater.WorkspaceIsolator.refresh();
                delete Me.workspaceIsolater;
            }
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