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
const Main = imports.ui.main;
const { extensionUtils, util } = imports.misc;
const { extensionSystem, popupMenu, panelMenu, boxpointer } = imports.ui;
const { GObject, St, Clutter, Gtk, GLib } = imports.gi;

//Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const { dev, utils, uiUtils, fileUtils } = Me.imports;
const { workspaceManager } = Me.imports;

var WorksetsIndicator = GObject.registerClass({
    GTypeName: 'WorksetsIndicator'
}, class WorksetsIndicator extends panelMenu.Button {
    _init() {
        try {
        super._init(0.0, "WorksetsIndicator");
        Me.worksetsIndicator = this;

        // Set up menu box to build into
        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box worksets-indicator-hbox' });
        this.icon = new St.Icon({ icon_name: 'tab-new-symbolic', style_class: 'system-status-icon worksets-indicator-icon' });
        hbox.add_child(this.icon);
        //let buttonText = new St.Label(    {text: (''), y_align: Clutter.ActorAlign.CENTER }   );
        //hbox.add_child(buttonText);
        (this.add_child) ? this.add_child(hbox) : this.actor.add_child(hbox);

        //Build our menu
        this._buildMenu();
        this._refreshMenu()

        this.popUpMenus = [];
        this.menu.connect('menu-closed', () => {
            try {
            Me.worksetsIndicator.popUpMenus.forEach(function(popupMenu) {
                //Main.uiGroup.remove_actor(popupMenu.actor);
                popupMenu.menuItem.isShowing = false;
                popupMenu.actor.destroy();
            }, this);
            Me.worksetsIndicator.popUpMenus = [];
            Me.worksetsIndicator.optionsMenuItem.show();
            
            } catch(e) { dev.log(e) }
        });

        this.menu.connect('open-state-changed', () => {
            try {
            this._refreshMenu();
            } catch(e) { dev.log(e) }
        });

        Main.panel.addToStatusArea('WorksetsIndicator', this, 1);
        } catch(e) { dev.log(e) }
    }
    //main UI builder
    _buildMenu() {
        try {
        // Sub menu for option switches
        this.optionsMenuItem = new popupMenu.PopupSubMenuMenuItem('Extension Options', true);
        this.optionsMenuItem.icon.icon_name = 'org.gnome.tweaks';
        this.optionsMenuItems = [];
        Me.session.activeSession.Options.forEachEntry(function (optionName, optionValue) {
            let settingsKeyName = utils.textToKebabCase(optionName)
            let optionMenuItem = new popupMenu.PopupSwitchMenuItem(_(Me.settings.settings_schema.get_key(settingsKeyName).get_summary()), Me.session.activeSession.Options[optionName], { reactive: true });
            optionMenuItem.optionName = optionName;
            let apply = (optionName == 'IsolateWorkspaces')
                ? function() { Me.workspaceManager.activateIsolater(); }
                : function() { Me.session.activeSession.Options[optionName] = !Me.session.activeSession.Options[optionName]; Me.session.applySession(); }
            optionMenuItem.pressHandler = optionMenuItem.connect('toggled', ()=>{  apply();});
            //optionMenuItem.pressHandler = optionMenuItem.connect('button_release_event', ()=>{  apply();  });
            uiUtils.createTooltip(optionMenuItem, {msg: Me.settings.settings_schema.get_key(settingsKeyName).get_description()});
            this.optionsMenuItems.push(optionMenuItem)
            this.optionsMenuItem.menu.addMenuItem(optionMenuItem);
        }, this);
        this.menu.addMenuItem(this.optionsMenuItem);

        // Menu sections for workset items
        this.viewSection = new popupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.viewSection);

        // Add separator
        this.ViewSectionSeperator = new popupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this.ViewSectionSeperator);

        // Default
        this.defaultSection = new popupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.defaultSection);

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
        sessionMenuItem.label.set_x_expand(true);
        this.menu.sessionMenuItem = sessionMenuItem;
        this.menu.addMenuItem(sessionMenuItem);

        sessionMenuItem.connect('activate', ()=>{Me.session.newWorkset(); this._refreshMenu(); });

        uiUtils.createIconButton(sessionMenuItem, 'document-open-symbolic', () => {Me.session.loadObject(); this._refreshMenu();}, {}, {msg: "Load a custom workspace from backups"});
        uiUtils.createIconButton(sessionMenuItem, 'tab-new-symbolic', () => {Me.session.newWorkset(); this._refreshMenu();}, {}, {msg: "Create new custom workspace"});


        // Add separator
        this.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem());

        } catch(e) { dev.log(e) }
    }
    //This is run periodically via _refreshMenu()
    _addWorksetMenuItemEntry(workSetsArrayBuffer) {
        try {
        let menuItem = new popupMenu.PopupSubMenuMenuItem('', true);
        menuItem.buttonPressId = menuItem.connect('button_release_event', () => {this._worksetSubMenuRefresh(menuItem); } );

        // Connect menu items to worksets array
        menuItem.workset = workSetsArrayBuffer;
        menuItem.label.text = menuItem.workset.WorksetName;

        // Create iconbuttons on MenuItem
        let activeIndex = Me.session.getWorksetActiveIndex(menuItem.workset);
        //let iconfav_nameuri = menuItem.workset.Favorite ? 'starred-symbolic' : 'non-starred-symbolic';
        let icondefault_nameuri = (Me.session.activeSession.Default == menuItem.workset.WorksetName) ? 'starred-symbolic' : ['non-starred-symbolic', 'starred-symbolic'];
        let iconOpenNew_nameuri = (activeIndex > -1) ? 'window-close-symbolic' : 'list-add-symbolic';
        let iconOpenHere_nameuri = (activeIndex > -1) ? 'view-reveal-symbolic' : 'go-jump-symbolic';
        let openCloseCommand = (activeIndex > -1)
             ? () => {Me.session.closeWorkset(menuItem.workset); this._refreshMenu();}
             : () => {Me.session.displayWorkset(menuItem.workset, true); this._refreshMenu();};
        let openCloseMsg = (activeIndex > -1)
             ? "Disengage '"+menuItem.workset.WorksetName+"'"
             : "Load '"+menuItem.workset.WorksetName+"' in a new workspace";
        let viewOpenMessage = (activeIndex > -1)
             ? "Switch to '"+menuItem.workset.WorksetName+"'"
             : "Load '"+menuItem.workset.WorksetName+"' in this workspace";
        //uiUtils.createIconButton(menuItem, iconfav_nameuri, () => {this._worksetMenuItemToggleFavorite(menuItem); this._refreshMenu();}, true, {msg: "Pin '"+menuItem.workset.WorksetName+"' to the top of the list"});
        uiUtils.createIconButton(menuItem, icondefault_nameuri, () => {Me.session.setDefaultWorkset(menuItem.workset); this._refreshMenu();}, true, {msg: "Set '"+menuItem.workset.WorksetName+"' as the default"});
        uiUtils.createIconButton(menuItem, 'document-save-symbolic', () => {Me.session.saveWorkset(menuItem.workset); this._refreshMenu();}, {}, {msg: "Save a backup of '"+menuItem.workset.WorksetName+"'"});
        uiUtils.createIconButton(menuItem, 'edit-delete-symbolic', () => {Me.session.deleteWorkset(menuItem.workset); this._refreshMenu();}, {}, {msg: "Delete '"+menuItem.workset.WorksetName+"' and save a backup"});
        uiUtils.createIconButton(menuItem, 'document-edit-symbolic', () => {Me.session.editWorkset(menuItem.workset); this._refreshMenu();}, {}, {msg: "Edit '"+menuItem.workset.WorksetName+"'"});
        uiUtils.createIconButton(menuItem, iconOpenNew_nameuri, openCloseCommand, {}, {msg: openCloseMsg});
        //uiUtils.createIconButton(menuItem, iconOpenHere_nameuri, () => {Me.session.displayWorkset(menuItem.workset); this._refreshMenu();}, {}, {msg: viewOpenMessage});

        //Decorate with indicator if active
        menuItem.favAppsMenuItems = [];

            //menuItem.setOrnament(popupMenu.Ornament.CHECK);

        //if (activeIndex > -1) {
            menuItem._ornamentLabel.text = '';
            menuItem._ornamentIcon = new St.BoxLayout({ style_class: 'popup-menu-icon-ornament' });
            menuItem.replace_child(menuItem._ornamentLabel, menuItem._ornamentIcon);
            let icon = uiUtils.createIconButton(menuItem._ornamentIcon, iconOpenHere_nameuri, () => {Me.session.displayWorkset(menuItem.workset); this._refreshMenu();}, {icon_size: 14}, {msg: viewOpenMessage});
            icon.translation_x = 3.5;
        //
        //Default and currently active always up the top
        let defaultMenuItem, activeMenuItem;
        if (Me.session.activeSession.Default == menuItem.workset.WorksetName) {
            defaultMenuItem = menuItem;
            this.defaultSection.addMenuItem(menuItem, 0);
            this.defaultSection.moveMenuItem(defaultMenuItem , 0);
        } else if (Me.workspaceManager.activeWorksetName == menuItem.workset.WorksetName) {
            activeMenuItem = menuItem;
            this.defaultSection.addMenuItem(menuItem, 0);
            this.defaultSection.moveMenuItem(activeMenuItem , 1);
        }else (activeIndex > -1)
                ? this.favoritesSection.addMenuItem(menuItem, 0) : this.historySection.addMenuItem(menuItem, 0);

        if (activeMenuItem)
            this.defaultSection.moveMenuItem(activeMenuItem , 1);
        if (defaultMenuItem)
            this.defaultSection.moveMenuItem(defaultMenuItem , 0);
        } catch(e) { dev.log(e) }
    }
    _worksetSubMenuRefresh(menuItem) {
        try {
        let firstMenuItem = this.historySection.firstMenuItem;

        if (!menuItem.isShowing) menuItem.isShowing = false;
        let isShowing = menuItem.isShowing;

        // Destroy any previous menus
        Me.worksetsIndicator.popUpMenus.forEach(function(wspopupMenu) {
            if (wspopupMenu.menuItem.worksetPopupMenu) wspopupMenu.menuItem.worksetPopupMenu.menu.bye();
            wspopupMenu.menuItem.isShowing = false;
            wspopupMenu.menuItem._triangle.ease({
                rotation_angle_z: 0,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_EXPO,
            });
        }, this);
        Me.worksetsIndicator.popUpMenus = [];

        // Area for object info
        //menuItem.worksetPopupMenu = new popupMenu.PopupMenu(menuItem.actor, St.Align.START, St.Side.BOTTOM);
        menuItem.worksetPopupMenu = new popupMenu.PopupSubMenuMenuItem("Details for '"+ menuItem.workset.WorksetName +"'", true);
        menuItem.worksetPopupMenu.icon.icon_name = 'org.gnome.tweaks'
        menuItem.worksetPopupMenu.actor.add_style_class_name('panel-menu');
        menuItem.worksetPopupMenu.menuItem = menuItem;
        menuItem.worksetPopupMenu.menu.bye = function() {
            try {
            Me.worksetsIndicator.popUpMenus.forEach(function(wspopupMenu) {
                //Main.uiGroup.remove_actor(wspopupMenu.actor);
                
                wspopupMenu.menuItem.isShowing = false;
                wspopupMenu.menuItem._triangle.ease({
                    rotation_angle_z: 0,
                    duration: 250,
                    mode: Clutter.AnimationMode.EASE_OUT_EXPO,
                });
                wspopupMenu.menu.close(boxpointer.PopupAnimation.FULL);
                GLib.timeout_add(null, 100, ()=> { // Wait for the close animation
                    wspopupMenu.destroy(); 
                } ); 
                
                wspopupMenu.menuItem.worksetPopupMenu = null;
            }, this);
            Me.worksetsIndicator.popUpMenus = [];
            Me.worksetsIndicator.optionsMenuItem.show();
            } catch(e) { dev.log(e) }
        }
        menuItem.worksetPopupMenu.connect('button_release_event', ()=>{
            menuItem.worksetPopupMenu.menu.bye();
            //return Clutter.EVENT_STOP;
        });
        menuItem.worksetPopupMenu.menu.connect('menu-closed', ()=>{
            //menuItem.worksetPopupMenu.menu.bye();
            //return Clutter.EVENT_STOP;
        });
        menuItem.worksetPopupMenu.menu.connect('destroy', ()=>{
            //menuItem.worksetPopupMenu.menu.bye();
            //return Clutter.EVENT_STOP;
        });

        let viewArea = menuItem.worksetPopupMenu.menu;
        this.popUpMenus.push(menuItem.worksetPopupMenu);
        viewArea.lastOpen = menuItem;

        // Background info
        menuItem.bgMenuButton = new popupMenu.PopupBaseMenuItem();
        menuItem.bgMenuButton.content_gravity = Clutter.ContentGravity.RESIZE_ASPECT;

        uiUtils.setImage(menuItem.workset.BackgroundImage, menuItem.bgMenuButton)
        viewArea.addMenuItem(menuItem.bgMenuButton);

        // The click from opening the submenu was hitting this item too, this hack seems to work
        menuItem.bgMenuButton.clickSignalId = menuItem.bgMenuButton.connect('activate', () => {
            Me.session.setWorksetBackgroundImage(menuItem.workset);
            this.menu.itemActivated(boxpointer.PopupAnimation.FULL);
        });
        uiUtils.createTooltip(menuItem.bgMenuButton, {msg: "Click to select a new desktop background for '"+menuItem.workset.WorksetName+"'"});

        // Workset info
        let infoText = "Has these favourites";
        Me.session.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
            if (workspaceMapValues.defaultWorkset == menuItem.workset.WorksetName)
                infoText += " on the " + utils.stringifyNumber(parseInt(workspaceMapKey.substr(-1, 1))+1) + " workspace";
        }, this);
        menuItem.infoMenuButton = new popupMenu.PopupImageMenuItem(_(infoText), '');
        menuItem.infoMenuButton.label.set_x_expand(true);
        menuItem.infoMenuButton.setOrnament(popupMenu.Ornament.DOT)
        let addApps = () => {
            this.menu.toggle();
            utils.spawnWithCallback(null, [fileUtils.APP_CHOOSER_EXEC, '-w', menuItem.workset.WorksetName], fileUtils.GLib.get_environ(), 0, null,
                (resource) => {
                    try {
                    if (!resource) return;
                    let newFav = JSON.parse(resource);
                    Me.session.Worksets.forEach(function(workset, i) {
                        if (workset.WorksetName == menuItem.workset.WorksetName) {
                            Me.session.Worksets[i].FavApps.push(newFav);
                            Me.session.setFavorites(Me.session.Worksets[i].FavApps);
                            Me.session.saveSession();
                        }
                    }, this);
                    } catch(e) { dev.log(e) }
                });
        }
        uiUtils.createIconButton(menuItem.infoMenuButton, 'document-edit-symbolic', addApps, {}, {msg: "Add an application to '"+menuItem.workset.WorksetName+"' favourites"});
        menuItem.infoMenuButton.connect('button_release_event', addApps);
        uiUtils.createTooltip(menuItem.infoMenuButton, {msg: "Click to select an application to add to '"+menuItem.workset.WorksetName+"' favourites"});
        viewArea.addMenuItem(menuItem.infoMenuButton);

        // Favorite Apps entries
        menuItem.workset.FavApps.forEach(function(favApp, i){
            let {name, displayName, exec, icon} = favApp;
            icon = icon || 'web-browser-sybmolic';
            menuItem.favAppsMenuItems[i] = new popupMenu.PopupImageMenuItem(_(displayName), icon);
            menuItem.favAppsMenuItems[i].label.set_x_expand(true);
            uiUtils.createTooltip(menuItem.favAppsMenuItems[i], {msg: "Click to launch '"+displayName+"'"});
            menuItem.favAppsMenuItems[i].connect('activate', () => {
                let [success, argv] = GLib.shell_parse_argv(exec.replace('%u', ' ').replace('%U', ' '))
                util.spawn(argv);
                // To do get pid and use AppSystem to focus window - same with the bgmenu editor
            });
            uiUtils.createIconButton(menuItem.favAppsMenuItems[i], 'edit-delete-symbolic', () => {
                try {
                menuItem.favAppsMenuItems[i].destroy();
                Me.session.removeFavorite(menuItem.workset, name);
                } catch(e) { dev.log(e) }
            }, {}, {msg: "Remove '"+displayName+"' from '"+menuItem.workset.WorksetName+"' favourites"});
            viewArea.addMenuItem(menuItem.favAppsMenuItems[i]);
        }, this);
        

        //Main.uiGroup.add_actor(menuItem.worksetPopupMenu.actor);
        this.viewSection.addMenuItem(menuItem.worksetPopupMenu);
        if (isShowing) {
            menuItem.isShowing = false;
            viewArea.bye();
            menuItem._triangle.ease({
                rotation_angle_z: 0,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_EXPO,
            });
        } else {
            menuItem._triangle.ease({
                rotation_angle_z: -90,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_EXPO,
            });
            menuItem.isShowing = true;
            viewArea.open(boxpointer.PopupAnimation.FULL);
            menuItem.worksetPopupMenu.show();
            this.optionsMenuItem.hide();
        }
        } catch(e) { dev.log(e) }

    }
    _refreshMenu() {
        try {
        Me.session.loadSession();

        // Ensure option switches match settings
        this.optionsMenuItems.forEach(function (menuItem, i) {
            this.optionsMenuItems[i]._switch.state = Me.session.activeSession.Options[this.optionsMenuItems[i].optionName];
        }, this);

        //Remove all and re-add with any changes
        if (!utils.isEmpty(Me.session.activeSession)) {
            this._worksetMenuItemsRemoveAll();
            Me.session.Worksets.forEach(function (worksetBuffer) {
                this._addWorksetMenuItemEntry(worksetBuffer);
            }, this);
            Me.session.saveSession();
        }
        } catch(e) { dev.log(e) }
    }
    _findRawWorksetByMenuItem(menuItem) {
        let tmpWorkset = Me.session.Worksets.filter(item => item === menuItem.workset)[0];
        return tmpWorkset;
    }
    _worksetMenuItemsGetAll(text) {
        return this.historySection._getMenuItems().concat(this.favoritesSection._getMenuItems()).concat(this.defaultSection._getMenuItems());
    }
    _worksetMenuItemsRemoveAll() {
        this._worksetMenuItemsGetAll().forEach(function (mItem) { if (mItem.destroyIconButtons) mItem.destroyIconButtons(); mItem.destroy(); });
    }
    _worksetMenuItemMoveToTop(menuItem) {
        try {
        Me.session.Worksets.forEach(function (worksetBuffer) {
            if (worksetBuffer === menuItem.workspace) {
                this._addWorksetMenuItemEntry(worksetBuffer);
            }
        }, this);
        this._refreshMenu();
        } catch(e) { dev.log(e) }
    }
    _worksetMenuItemToggleFavorite(menuItem) {
        try {
        Me.session.Worksets.forEach(function (worksetBuffer, i) {
            if (worksetBuffer.WorksetName == menuItem.workset.WorksetName) {
                Me.session.Worksets[i].Favorite = !Me.session.Worksets[i].Favorite;
            }
        }, this);
        Me.session.saveSession();

        this._worksetMenuItemMoveToTop(menuItem);
        } catch(e) { dev.log(e) }
    }
    toggleMenu(){
        this.menu.toggle();
    }
});