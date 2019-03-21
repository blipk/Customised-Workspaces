/*
 * Worksets extension for Gnome 3
 * This file is part of the worksets extension for Gnome 3
 * Copyright (C) 2019 A.D. - http://blipk.xyz
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
const Clutter = imports.gi.Clutter;
const ExtensionSystem = imports.ui.extensionSystem;
const ExtensionUtils = imports.misc.extensionUtils;
const Gettext = imports.gettext;
const Lang = imports.lang;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const St = imports.gi.St;
const Util = imports.misc.util;
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
var WorksetsIndicator = Lang.Class({
    Name: 'WorksetsIndicator',
    Extends: PanelMenu.Button,
   
    destroy: function () {
        try {
        if (Me.workspaceIsolater) {
            Me.workspaceIsolater.destroy();
            workspaceIsolater.WorkspaceIsolator.refresh();
            delete Me.workspaceIsolater;
        }
        this.disconnectAll();
        this.parent();
        delete Main.panel.statusArea['WorksetsIndicator'];
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
    },
    _init: function() {
        try {
        this.parent(0.0, "WorksetsIndicator");

        //set up menu box to build into
        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box worksets-indicator-hbox' });
        this.icon = new St.Icon({ icon_name: INDICATOR_ICON, style_class: 'system-status-icon worksets-indicator-icon' });
        hbox.add_child(this.icon);
        let buttonText = new St.Label(    {text: ('Worksets'), y_align: Clutter.ActorAlign.CENTER }   );
        hbox.add_child(buttonText);
        this.actor.add_child(hbox);

        //Build our menu
        this._buildMenu();
        this._worksetMenuItemsRefreshAll()
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }    
    },
    _onEvent: function(actor, event) {/*Override from parent class to handle menuitem refresh*/
        this._worksetMenuItemsRefreshAll();
        this.parent(actor, event);
    },
    //main UI builder
    _buildMenu: function () {
        try {
        // Isolate running apps switch
        let isolateRunningAppsMenuItem = new PopupMenu.PopupSwitchMenuItem(_("Isolate running applications"), ISOLATE_RUNNING, { reactive: true });
        isolateRunningAppsMenuItem.connect('toggled', this._onIsolateSwitch);
        this.menu.addMenuItem(isolateRunningAppsMenuItem);

        // Add 'Settings' menu item to open settings
        //let settingsMenuItem = new PopupMenu.PopupMenuItem(('Settings'));
        //this.menu.addMenuItem(settingsMenuItem);
        //settingsMenuItem.connect('activate', Lang.bind(this, this._openSettings));

        // Add separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Menu sections for workset items
        // Favorites
        this.favoritesSection = new PopupMenu.PopupMenuSection();
        this.scrollViewFavoritesMenuSection = new PopupMenu.PopupMenuSection();
        let favoritesScrollView = new St.ScrollView({
            style_class: 'ci-history-menu-section', overlay_scrollbars: true
        });
        favoritesScrollView.add_actor(this.favoritesSection.actor);
        this.scrollViewFavoritesMenuSection.actor.add_actor(favoritesScrollView);
        this.menu.addMenuItem(this.scrollViewFavoritesMenuSection);

        // History
        this.historySection = new PopupMenu.PopupMenuSection();
        this.scrollViewHistoryMenuSection = new PopupMenu.PopupMenuSection();
        let historyScrollView = new St.ScrollView({
            style_class: 'ci-history-menu-section', overlay_scrollbars: true
        });
        historyScrollView.add_actor(this.historySection.actor);
        this.scrollViewHistoryMenuSection.actor.add_actor(historyScrollView);
        this.menu.addMenuItem(this.scrollViewHistoryMenuSection);

        // Add separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Collections menu button menu
        let collectionsMenuItem = new PopupMenu.PopupMenuItem((''));
        collectionsMenuItem.iconButtons = [];
        collectionsMenuItem.iconsButtonsPressIds = [];
        collectionsMenuItem.nameText = "Collections";
        this.menu.collectionsMenuItem = collectionsMenuItem;
        this.menu.addMenuItem(collectionsMenuItem);
        
        this._worksetMenuItemSetEntryLabel(collectionsMenuItem);
        collectionsMenuItem.connect('activate', Lang.bind(this, Me.session.showObjectManager));

        uiUtils.createIconButton(collectionsMenuItem, 'document-open-symbolic', () => {Me.session.loadObject(); this._worksetMenuItemsRefreshAll();});
        uiUtils.createIconButton(collectionsMenuItem, 'document-properties-symbolic', () => {Me.session.showObjectManager(); this._worksetMenuItemsRefreshAll();});
        uiUtils.createIconButton(collectionsMenuItem, 'go-next-symbolic', () => {Me.session.nextCollection(); this._worksetMenuItemsRefreshAll();});
        uiUtils.createIconButton(collectionsMenuItem, 'tab-new-symbolic', () => {Me.session.newObject(); this._worksetMenuItemsRefreshAll();});
        uiUtils.createIconButton(collectionsMenuItem, 'go-previous-symbolic', () => {Me.session.prevCollection(); this._worksetMenuItemsRefreshAll();});
        uiUtils.createIconButton(collectionsMenuItem, 'document-save-symbolic', () => {Me.session.saveActiveCollection(); this._worksetMenuItemsRefreshAll();});
        
        // Add separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
    },
    //This is run periodically via _worksetMenuItemsRefreshAll()
    _addWorksetMenuItemEntry: function (workSetsArrayBuffer) {
        try {
        let menuItem = new PopupMenu.PopupMenuItem('');
        menuItem.menu = this.menu;

        // Connect menu items to worksets array
        menuItem.workset = workSetsArrayBuffer;
        menuItem.currentlyActive = menuItem.workset.active ? true : false;
        menuItem.favoriteState = menuItem.workset.Favorite;
        menuItem.nameText = menuItem.workset.WorksetName;

        // Connect menuitem and its iconbuttons
        menuItem.buttonPressId = menuItem.connect('activate', () => {this._worksetMenuItemsOnMenuSelected(menuItem);} );
        menuItem.iconButtons = []; menuItem.iconsButtonsPressIds = [];

        this._worksetMenuItemSetEntryLabel(menuItem);

        // Create iconbuttons on MenuItem
        let iconfav_nameuri = menuItem.favoriteState ? 'starred-symbolic' : 'non-starred-symbolic';
        let iconOpenNew_nameuri = menuItem.workset.active ? 'go-last-symbolic' : 'list-add-symbolic';
        uiUtils.createIconButton(menuItem, iconfav_nameuri, () => {this._worksetMenuItemToggleFavorite(menuItem); this._worksetMenuItemsRefreshAll();}, true);
        uiUtils.createIconButton(menuItem, iconOpenNew_nameuri, () => {Me.session.displayWorkset(menuItem.workset, true); this._worksetMenuItemsRefreshAll();});
        uiUtils.createIconButton(menuItem, 'document-save-symbolic', () => {Me.session.saveWorkset(menuItem.workset); this._worksetMenuItemsRefreshAll();});

        uiUtils.createIconButton(menuItem, 'document-properties-symbolic', () => {
            let editObjectChooseDialog = new uiUtils.ObjectEditorDialog("Properties of Workset: "+menuItem.nameText, () => {
                uiUtils.showUserFeedbackMessage("Changes saved.");
            }, menuItem.workset, [{WorksetName: 'Workset Name'}, {DefaultWorkspaceIndex: 'Load on workspace X by default'}, {Favorite: 'Favorite'}]);
        });

        uiUtils.createIconButton(menuItem, 'edit-delete-symbolic', () => {this._worksetMenuItemRemoveEntry(menuItem, 'delete'); this._worksetMenuItemsRefreshAll();});

        //Add to correct list (favorite/not) and decorate with indicator if active
        menuItem.favoriteState ? this.favoritesSection.addMenuItem(menuItem, 0) : this.historySection.addMenuItem(menuItem, 0);
        menuItem.workset.activeWorkspaceIndex === Me.workspaceManager.activeWorkspaceIndex ? menuItem.setOrnament(PopupMenu.Ornament.DOT) : menuItem.setOrnament(PopupMenu.Ornament.NONE);
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
    },
    _worksetMenuItemsRefreshAll: function () {
        try {     
        //Remove all and re-add with any changes
        if (!utils.isEmpty(Me.session.collections)) {
            this._worksetMenuItemsRemoveAll();
            Me.session.collections[Me.session.activeCollectionIndex].Worksets.forEach(function (worksetBuffer) {
                this._addWorksetMenuItemEntry(worksetBuffer);
            }, this);
            this.menu.collectionsMenuItem.nameText = Me.session.collections[Me.session.activeCollectionIndex].CollectionName;
            this._worksetMenuItemSetEntryLabel(this.menu.collectionsMenuItem);

            Me.session.saveSession();
        }
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
    },
    _findRawWorksetByMenuItem: function (menuItem) {
        let tmpWorkset = Me.session.collections[Me.session.activeCollectionIndex].Worksets.filter(item => item === menuItem.workset)[0];
        return tmpWorkset;
    },
    _worksetMenuItemSetEntryLabel: function (menuItem) {
        menuItem.label.set_text(utils.truncateString(menuItem.nameText, MAX_ENTRY_LENGTH));
    },
    _worksetMenuItemsGetAll: function (text) {
        return this.historySection._getMenuItems().concat(this.favoritesSection._getMenuItems());
    },
    _worksetMenuItemsRemoveAll: function () {
        this._worksetMenuItemsGetAll().forEach(function (mItem) { mItem.destroy(); });
    },
    _worksetMenuItemRemoveEntry: function (menuItem, event) {
        try {
        if(event === 'delete') {
            let backupFilename = Me.session.saveWorkset(menuItem.workset, true);
            Me.session.collections[Me.session.activeCollectionIndex].Worksets = Me.session.collections[Me.session.activeCollectionIndex].Worksets.filter(item => item !== menuItem.workset)
            this._worksetMenuItemsRefreshAll();
            menuItem.destroy();
            uiUtils.showUserFeedbackMessage("Workset removed from session and backup saved to "+backupFilename, true);
        }
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
    },
    _worksetMenuItemMoveToTop: function (menuItem) {
        try {
        this._worksetMenuItemRemoveEntry(menuItem);
        Me.session.collections[Me.session.activeCollectionIndex].Worksets.forEach(function (worksetBuffer) {
            if (worksetBuffer === menuItem.workspace) {
                this._addWorksetMenuItemEntry(worksetBuffer);
            }
        }, this);
        this._worksetMenuItemsRefreshAll();
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
    },
    _worksetMenuItemToggleFavorite: function (menuItem) {
        try {
        menuItem.favoriteState = menuItem.favoriteState ? false : true;

        Me.session.collections[Me.session.activeCollectionIndex].Worksets.forEach(function (worksetBuffer, i) {
            if (worksetBuffer === menuItem.workset) {
                Me.session.collections[Me.session.activeCollectionIndex].Worksets[i].Favorite = menuItem.favoriteState;
            }
        }, this);

        this._worksetMenuItemMoveToTop(menuItem);
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
    },
    _worksetMenuItemsOnMenuSelected: function (menuItem, close=false) {
        try {
        //Turn off all others
        this._worksetMenuItemsGetAll().forEach(function (mItem) {
            mItem.currentlyActive = false; mItem.setOrnament(PopupMenu.Ornament.NONE);
        }, this);

        //Toggle current in UI
        menuItem.currentlyActive ? menuItem.setOrnament(PopupMenu.Ornament.NONE) : menuItem.setOrnament(PopupMenu.Ornament.DOT);
        menuItem.currentlyActive = menuItem.currentlyActive ? false : true;

        //Activate selected workset
        Me.session.displayWorkset(menuItem.workset);
        this._worksetMenuItemsRefreshAll();

        if (close) {this.menu.close();}
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
    },
    _onIsolateSwitch: function(init=false) {
        try {
        ISOLATE_RUNNING = ISOLATE_RUNNING ? false: true;

        let dash2panel = ExtensionUtils.extensions['dash-to-panel@jderose9.github.com'];
        let dash2dock = ExtensionUtils.extensions['dash-to-dock@micxgx.gmail.com'];
        let dash2panelSettings, dash2dockSettings;
        if (dash2panel) dash2panelSettings = dash2panel.imports.extension.settings;
        if (dash2dock) dash2dockSettings = dash2dock.imports.extension.dockManager._settings;

        if (ISOLATE_RUNNING) {
            if (dash2panel && dash2panelSettings && dash2panel.state === ExtensionSystem.ExtensionState.ENABLED) {
                dash2panelSettings.set_boolean('isolate-workspaces', true);
            } else if (dash2dock && dash2dockSettings && dash2dock.state === ExtensionSystem.ExtensionState.ENABLED) {
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
        } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
    },
    _toggleMenu: function(){
        this.menu.toggle();
    },
    _openSettings: function () {
        Util.spawn(["gnome-shell-extension-prefs", Me.uuid]);
    }
});