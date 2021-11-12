/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) 2021 A.D. - http://kronosoul.xyz
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
const Main = imports.ui.main;
const { extensionSystem, appFavorites } = imports.ui;
const { extensionUtils, util } = imports.misc;
const { GObject, Gio, Clutter, Shell, Meta } = imports.gi;

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { dev, utils, uiUtils, fileUtils } = Me.imports;
const { panelIndicator, workspaceManager, workspaceIsolater, workspaceView } = Me.imports;

var SessionManager = class SessionManager {
    constructor() {
        try {
        Me.session = this;
        this.activeSession = null;
        this.allApps = {};

        this.signals = new utils.SignalHandler();

        // Set up our bindings
        this.signals.add(appFavorites.getAppFavorites(), 'changed', ()=>{this._favoritesChanged()})

        // Make sure our GTK App chooser is executable
        util.spawn(['chmod', '+x', fileUtils.APP_CHOOSER_EXEC]);

        // Create sesion or initialize from session file if it exists
        if (fileUtils.checkExists(fileUtils.CONF_DIR + '/session.json')) {
            let obj = fileUtils.loadJSObjectFromFile('session.json', fileUtils.CONF_DIR);
            this._setup(obj);
        } else {
            this.newSession(true);
            this._setup(this.activeSession);
        }
        } catch(e) { dev.log(e) }
    }
    destroy() {
        try {
        this.saveSession();
        this.signals.destroy()
        } catch(e) { dev.log(e) }
    }
    _watchOptions() {
        this.signals.add(Me.settings, 'changed::isolate-workspaces', () => {
            Me.session.activeSession.Options.IsolateWorkspaces = Me.settings.get_boolean('isolate-workspaces');
        });
        if (Me.gExtensions.dash2panel.settings && Me.gExtensions.dash2panel.state === extensionSystem.ExtensionState.ENABLED)
            this.signals.add(Me.gExtensions.dash2panel.settings, 'changed::isolate-workspaces', () => {
                Me.settings.set_boolean('isolate-workspaces', Me.gExtensions.dash2panel.settings.get_boolean('isolate-workspaces'));
                Me.session.saveSession();
            });

        this.signals.add(Me.settings, 'changed::show-workspace-overlay', () => {
                if (Me.workspaceViewManager) Me.workspaceViewManager.refreshOverview();
            });
        this.signals.add(Me.settings, 'changed::disable-wallpaper-management', () => {
                this.setBackground();
                if (Me.workspaceViewManager) Me.workspaceViewManager.refreshOverview();
            });

        this.dSettings = extensionUtils.getSettings('org.gnome.desktop.background');
        this.signals.add(this.dSettings, 'changed::picture-uri', () => {
                // Update active workset wallpaper info if changed elsewhere in gnome
                let bgPath = this.dSettings.get_string('picture-uri');
                let bgStyle = this.dSettings.get_string('picture-options');

                this.Worksets.forEach(function (worksetBuffer, worksetIndex) {
                    if (worksetBuffer.WorksetName != Me.workspaceManager.activeWorksetName) return;
                    this.Worksets[worksetIndex].BackgroundImage = bgPath;
                    this.Worksets[worksetIndex].BackgroundStyle = bgStyle;
                    this.saveSession();
                }, this);

                this.setBackground(bgPath, bgStyle);
            });

        this.signals.add(Me.settings, 'changed::show-panel-indicator', () => {
                this._loadOptions();
                if (!Me.worksetsIndicator) return;
                if (this.activeSession.Options.ShowPanelIndicator) {
                    Me.worksetsIndicator.show();
                    this.saveSession();
                    Me.worksetsIndicator.menu.isOpen ? null : Me.worksetsIndicator.toggleMenu();
                }
            });
    }
    _initOptions() {
        let keys = Me.settings.list_keys();
        keys.forEach((key) => {
            let k = Me.settings.settings_schema.get_key(key);
            if (k.get_default_value().toString().includes('"b"')) {  // GLib Variant Boolean
                this.activeSession.Options[utils.textToPascalCase(key)] = Me.settings.get_boolean(key);
            }
        }, this)
        this._saveOptions();
    }
    _saveOptions() {
        this.activeSession.Options.forEachEntry(function(optionName, optionValue) {
            if (optionName != 'ShowPanelIndicator')
                Me.settings.set_boolean(utils.textToKebabCase(optionName), this.activeSession.Options[optionName]);
        }, this);
        // This has to be last or the signal callback will change the other options
        Me.settings.set_boolean("show-panel-indicator", this.activeSession.Options.ShowPanelIndicator);
    }
    _loadOptions() {
        this.activeSession.Options.forEachEntry(function(optionName, optionValue) {
            this.activeSession.Options[optionName] = Me.settings.get_boolean(utils.textToKebabCase(optionName));
        }, this);
    }
    _setup(sessionObject) {
        try {
        if (!utils.isEmpty(sessionObject)) {
            this.activeSession = sessionObject;
            this.Worksets = this.activeSession.Worksets;
            this.workspaceMaps = this.activeSession.workspaceMaps;
            this.SessionName = this.activeSession.SessionName;
            if (utils.isEmpty(this.activeSession.Default)) this.activeSession.Default = this.Worksets[0].WorksetName;
            this._cleanWorksets();

            this._initOptions();
            this._loadOptions();
            this._watchOptions();
            this.saveSession();

            if (!Me.workspaceManager) Me.workspaceManager = new workspaceManager.WorkspaceManager();
            if (!Me.workspaceViewManager) Me.workspaceViewManager = new workspaceView.WorkspaceViewManager();
            if (!Me.worksetsIndicator) Me.worksetsIndicator = new panelIndicator.WorksetsIndicator();
            this.activeSession.Options.ShowPanelIndicator ? Me.worksetsIndicator.show() : Me.worksetsIndicator.hide();
        }
        } catch(e) { dev.log(e) }
    }
    resetIndicator() {
        Me.worksetsIndicator.destroy();
        delete Me.worksetsIndicator;
        delete Main.panel.statusArea['WorksetsIndicator'];

        Me.worksetsIndicator = new panelIndicator.WorksetsIndicator();
        Me.worksetsIndicator.show();
    }
    _cleanWorksets() {
        try {
        if (typeof this.SessionName !== 'string') this.SessionName = 'Default';

        let filteredWorksets;
        this.Worksets.forEach(function (worksetBuffer, ii) {
            //Fix entries
            if (!Array.isArray(worksetBuffer.FavApps)) worksetBuffer.FavApps = [];
            if (typeof worksetBuffer.WorksetName !== 'string') worksetBuffer.WorksetName = "Workset " + ii;
            if (typeof worksetBuffer.Favorite !== 'boolean') worksetBuffer.Favorite = false;

            // Remove duplicate entries
            filteredWorksets = this.Worksets.filter(function(item) {
                if (item !== worksetBuffer &&
                    (JSON.stringify(item) === JSON.stringify(worksetBuffer)))
                    { return false; }
                return true;
            }, this);
        }, this);

        // Apply
        this.Worksets = filteredWorksets;

        // Clean workspace maps
        let worksetNames = [];
        this.Worksets.forEach((workset) => {
            worksetNames.push(workset.WorksetName);
        }, this);

        this.workspaceMaps.forEachEntry((workspaceMapKey, workspaceMapValues, i) => {
            if (!worksetNames.includes(workspaceMapValues.currentWorkset))
                this.workspaceMaps[workspaceMapKey].currentWorkset = '';
        }, this);

        this.saveSession();
        } catch(e) { dev.log(e) }
    }
    loadSession(sessionsObject) {
        try {
        if (utils.isEmpty(sessionsObject))
            sessionsObject = fileUtils.loadJSObjectFromFile('session.json', fileUtils.CONF_DIR);
        this._setup(sessionsObject)

        if (Me.workspaceViewManager) Me.workspaceViewManager.refreshOverview();
        } catch(e) { dev.log(e) }
    }
    saveSession(backup=false) {
        try {
        if (utils.isEmpty(this.activeSession)) return;
        this._saveOptions();
        this.activeSession.Worksets = this.Worksets;
        this.activeSession.workspaceMaps = this.workspaceMaps;
        this.activeSession.SessionName = this.SessionName;

        let sessionCopy = JSON.parse(JSON.stringify(this.activeSession));
        let timestamp = new Date().toLocaleString().replace(/[^a-zA-Z0-9-. ]/g, '').replace(/ /g, '');
        let filename = (backup ? 'session-backup-'+timestamp+'.json' : 'session.json');
        fileUtils.saveToFile(sessionCopy, filename, fileUtils.CONF_DIR);

        if (Me.workspaceViewManager) Me.workspaceViewManager.refreshOverview();
        } catch(e) { dev.log(e) }
    }
    applySession(callback) {
        this.saveSession();
        if (callback) callback();
        this.loadSession();
    }
    getBackground() {
        try{
        let dSettings = extensionUtils.getSettings('org.gnome.desktop.background');
        let bgURI = dSettings.get_string('picture-uri');
        return bgURI.replace("file://", "");
        } catch(e) { dev.log(e) }
    }
    setBackground(bgPath = "", style = 'ZOOM') {
        if (this.activeSession.Options.DisableWallpaperManagement) return;
        if (!bgPath)
            bgPath = this.Worksets.filter(w => w.WorksetName == Me.workspaceManager.activeWorksetName)[0].BackgroundImage;
        bgPath = bgPath.replace("file://", "");

        let dSettings = extensionUtils.getSettings('org.gnome.desktop.background');
        dSettings.set_string('picture-uri', 'file://'+bgPath);
        dSettings.set_string('picture-options', style.toLowerCase());

        // workspaceView is losing track of the original bgmanager so this has to be updated here to affect other changes in the system
        let newbg = new Meta.Background({ meta_display: Me.gScreen });
        newbg.set_file(Gio.file_new_for_path(bgPath),
            imports.gi.GDesktopEnums.BackgroundStyle[style] || imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);

        Main.layoutManager._bgManagers.forEach(function(bgMan, ii) {
            if (bgMan.backgroundActor) {
                if (bgMan.backgroundActor.content)
                    bgMan.backgroundActor.content.background = newbg;
                else
                    bgMan.backgroundActor.background = newbg
            }
        }, this);

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
    setFavorites(favArray) {
        try {
        favArray = favArray || this.Worksets.filter(w => w.WorksetName == Me.workspaceManager.activeWorksetName)[0].FavApps;
        let outFavorites = []
        favArray.forEach(function(favorite, i) {
            outFavorites.push(favorite.name)
        }, this);
        global.settings.set_strv("favorite-apps", outFavorites);
        } catch(e) { dev.log(e) }
    }
    getFavorites(appList) {
        try {
        this.scanInstalledApps();
        let currentFavorites = global.settings.get_strv("favorite-apps");
        if (appList) currentFavorites = appList;
        let newFavorites = [];

        currentFavorites.forEach(function(favorite, i) {
            newFavorites.push({'name': favorite, 'displayName': this.allApps[favorite].displayName, 'icon': this.allApps[favorite].icon || '', 'exec': this.allApps[favorite].exec || '' })
        }, this);

        return newFavorites;
        } catch(e) { dev.log(e) }
    }
    removeFavorite(workset, appid) {
        try {
        this.Worksets.forEach(function (worksetBuffer, i) {
            if (worksetBuffer.WorksetName == workset.WorksetName) {
                this.Worksets[i].FavApps = worksetBuffer.FavApps.filter(favApps => favApps.name != appid)
                if (Me.workspaceManager.activeWorksetName == workset.WorksetName)
                    this.setFavorites(this.Worksets[i].FavApps);
                return;
            }
        }, this);
        this.saveSession();
        } catch(e) { dev.log(e) }
    }
    _favoritesChanged() {
        try {
        this.Worksets.forEach(function (worksetBuffer, worksetIndex) {
            if(worksetBuffer.WorksetName == Me.workspaceManager.activeWorksetName) {
                this.Worksets[worksetIndex].FavApps = this.getFavorites();
            }
        }, this);
        this.saveSession()
        } catch(e) { dev.log(e) }
    }
    scanInstalledApps() {
        // Shell.AppSystem includes flatpak and snap installed applications
        let installedApps = Shell.AppSystem.get_default().get_installed();
        installedApps.forEach(function(app){
            let id = app.get_id();
            let name = app.get_name() || app.get_display_name() || 'Unknown App Name';
            let exec = app.get_string("Exec");
            let icon = '';
            if (app.get_icon()) icon = app.get_icon().to_string();
            this.allApps[id] = {'displayName': name, 'icon': icon, 'exec': exec };
        }, this);
    }
    getWorksetActiveIndex(workset) {
        let name = workset.WorksetName || workset;
        let isActive = -1;
        this.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues) {
            if (workspaceMapValues.currentWorkset == name) {
                isActive = parseInt(workspaceMapKey.substr(-1, 1));
                return;
            }
        }, this);

        return isActive;
    }
    displayWorkset(workset, loadInNewWorkspace=false, displayOnly=false) {
        try {
        let activeIndex = this.getWorksetActiveIndex(workset);

        if (activeIndex > -1 && !displayOnly && !loadInNewWorkspace) { // Switch to it if already active
            if (Me.workspaceManager.activeWorkspaceIndex != activeIndex) Me.workspaceManager.switchToWorkspace(activeIndex);
            if (this.activeSession.Options.ShowNotifications) uiUtils.showUserNotification("Switched to active environment " + workset.WorksetName, false, 1);
        } else if (!displayOnly) {
            if (loadInNewWorkspace) {
                //Me.workspaceManager.lastWorkspaceActiveWorksetName = workset.WorksetName;
                Me.workspaceManager._workspaceUpdate();
                if (typeof loadInNewWorkspace == 'number')
                    Me.workspaceManager.switchToWorkspace(loadInNewWorkspace);
                else
                    Me.workspaceManager.switchToWorkspace(Me.workspaceManager.NumGlobalWorkspaces-1);
            }
            Me.workspaceManager.activeWorksetName = workset.WorksetName;
            if (this.activeSession.Options.ShowNotifications) uiUtils.showUserNotification("Loaded environment " + workset.WorksetName, false, 1.4);
        }

        this.setFavorites(workset.FavApps);
        this.setBackground(workset.BackgroundImage, workset.BackgroundStyle);

        this.saveSession();
        } catch(e) { dev.log(e) }
    }
    get DefaultWorkset() { // Returns the object from the WorksetName
        let index = this.Worksets.findIndex(w => w.WorksetName == this.activeSession.Default);
        return this.Worksets[index];
    }
    closeWorkset(workset) {
        try {
            let closing;
            this.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues) {
                if (workspaceMapValues.currentWorkset == workset.WorksetName) closing = workspaceMapKey;
            }, this);
            this.workspaceMaps[closing].currentWorkset = '';

            // Show the default
            if (parseInt(closing.substr(-1, 1)) == Me.workspaceManager.activeWorkspaceIndex)
                this.displayWorkset(this.DefaultWorkset, false, true);

            if (this.activeSession.Options.ShowNotifications) uiUtils.showUserNotification("Environment '" + workset.WorksetName + "' disengaged.", false, 1.8);
            this.saveSession();
        } catch(e) { dev.log(e) }
    }

    // Workset Management
    setWorksetBackgroundImage(workset) {
        try {
        utils.spawnWithCallback(null, ['/usr/bin/zenity', '--file-selection', '--title=Choose Background for ' + workset.WorksetName],  fileUtils.GLib.get_environ(), 0, null,
        (resource) => {
            try {
            if (!resource) return;
            resource = resource.trim();
            let filePath = fileUtils.GLib.path_get_dirname(resource);
            let fileName = fileUtils.GLib.path_get_basename(resource);

            // Find the workset and update the background image path property
            this.Worksets.forEach(function (worksetBuffer, worksetIndex) {
                if (worksetBuffer.WorksetName != workset.WorksetName) return;
                this.Worksets[worksetIndex].BackgroundImage = resource;
                this.Worksets[worksetIndex].BackgroundStyle = this.Worksets[worksetIndex].BackgroundStyle || 'ZOOM';
                this.saveSession();
            }, this);

            uiUtils.showUserNotification("Background Image Changed", true)
            if (Me.workspaceManager.activeWorksetName == workset.WorksetName) this.setBackground(resource);
            if (Me.workspaceViewManager) Me.workspaceViewManager.refreshOverview();
            } catch(e) { dev.log(e) }
        });
        } catch(e) { dev.log(e) }
    }
    newSession(fromEnvironment=false, backup=false) {
        try {
        if (backup) this.saveSession(true);

        //Create new session object from protoype in gschema
        let sessionObject = JSON.parse(Me.settings.get_string("session-prototype-json"));
        let workspaceMaps = JSON.parse(Me.settings.get_string("workspace-maps-prototype-json"));

        if (fromEnvironment) {
            //Build on prototype from current environment, blank prototype workset add all current FavApps to Primary workset
            sessionObject.SessionName = "Default";
            sessionObject.Favorite = true;
            sessionObject.Worksets[0].FavApps = this.getFavorites();
            sessionObject.Worksets[0].WorksetName = "Primary";
            sessionObject.Worksets[0].Favorite = true;
            sessionObject.Worksets[0].BackgroundImage = this.getBackground();
            sessionObject.Worksets[0].BackgroundStyle = 'ZOOM';
            sessionObject.workspaceMaps = workspaceMaps;
            sessionObject.workspaceMaps['Workspace0'].defaultWorkset = "Primary";
            sessionObject.workspaceMaps['Workspace0'].currentWorkset = "Primary";
        } else {
            sessionObject.SessionName = "Default";
            sessionObject.Worksets[0].WorksetName = "New";
            sessionObject.workspaceMaps = workspaceMaps;
            sessionObject.workspaceMaps['Workspace0'].defaultWorkset = "New";
            sessionObject.workspaceMaps['Workspace0'].currentWorkset = "New";
        }
        //Load the session
        this.loadSession(sessionObject);
        } catch(e) { dev.log(e) }
    }
    newWorkset(name, fromEnvironment=true, activate=false) {
        try {
        //Create new workset object from protoype in gschema
        let worksetObject = JSON.parse(Me.settings.get_string("workset-prototype-json"));
        let currentFavoriteApplications = this.getFavorites();
        let currentRunningApplications = this.getFavorites(Me.workspaceManager.getWorkspaceAppIds());

        // Remove duplicates
        let newFavs = currentFavoriteApplications.concat(currentRunningApplications);
        newFavs = newFavs.filter((item, index, self) => index === self.findIndex( (t) => ( t.name === item.name ) ));

        if (fromEnvironment) {
            //Build on prototype from current environment, add all current FavApps+RunningApps to it
            worksetObject.FavApps = newFavs;
            worksetObject.Favorite = true;
        } else {
            //Blank prototype with no FavApps
            worksetObject.FavApps = [];
            worksetObject.Favorite = false;
        }

        worksetObject.BackgroundImage = this.getBackground();

        if (!name) {
            let timestamp = new Date().toLocaleString().replace(/[^a-zA-Z0-9-. ]/g, '').replace(/ /g, '-');
            let buttonStyles = [ { label: "Cancel", key: Clutter.KEY_Escape, action: function(){this.close(' ')} }, { label: "Done", default: true }];
            let getNewWorksetNameDialog = new uiUtils.ObjectInterfaceDialog("Please enter name for the new custom workspace:", (returnText) => {
                if (!returnText) return;
                returnText = returnText.trim();
                if (returnText == '') return;

                let exists = false;
                this.Worksets.forEach(function (worksetBuffer) {
                    if (worksetBuffer.WorksetName == returnText) {
                        exists = true;
                        uiUtils.showUserNotification("Environment with name '"+returnText+"' already exists.");
                    }
                }, this);
                if (exists) return;

                worksetObject.WorksetName = returnText;

                //Push it to the session
                this.Worksets.push(worksetObject);
                this.saveSession();
                if (activate) this.displayWorkset(this.Worksets[this.Worksets.length-1]);
                uiUtils.showUserNotification("Environment "+returnText+" created.");
            }, true, false, [], [], buttonStyles, 'Environment '+timestamp);
        } else {
            worksetObject.WorksetName = name;
            //Push it to the session
            this.Worksets.push(worksetObject);
            this.saveSession();
            if (activate) this.displayWorkset(this.Worksets[this.Worksets.length-1]);
        }

        } catch(e) { dev.log(e) }
    }
    editWorkset(worksetIn) {
        try {
        let editable = {};
        Object.assign(editable, worksetIn);
        let workSpaceOptions = {Workspace0: false, Workspace1: false, Workspace2: false, Workspace3: false, Workspace4: false};
        let workSpaceOptions2 = {Workspace5: false, Workspace6: false, Workspace7: false, Workspace8: false, Workspace9: false};
        this.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
            try {
            if (workspaceMapValues.defaultWorkset == worksetIn.WorksetName) {
                if (workSpaceOptions[workspaceMapKey] != undefined) workSpaceOptions[workspaceMapKey] = true;
                if (workSpaceOptions2[workspaceMapKey] != undefined) workSpaceOptions2[workspaceMapKey] = true;
            }
            } catch(e) { dev.log(e) }
        }, this);

        editable.workSpaceOptionsLabel = "Null"
        editable.workSpaceOptions = workSpaceOptions;
        editable.workSpaceOptions2 = workSpaceOptions2;
        let workspaceOptionsEditables = [{Workspace0: 'First', Workspace1: 'Second', Workspace2: 'Third', Workspace3: 'Fourth', Workspace4: 'Fifth'}]
        let workspaceOptionsEditables2 = [{Workspace5: 'Sixth', Workspace6: 'Seventh', Workspace7: 'Eighth', Workspace8: 'Ninth', Workspace9: 'Tenth'}]

        let editables = [{WorksetName: 'Name'}, {BackgroundImage: ' ', hidden: true}, {Favorite: 'Favorite'},
            {workSpaceOptionsLabel: 'Opens on these workspaces automatically:', labelOnly: true},
            {workSpaceOptions: ' ', subObjectEditableProperties: workspaceOptionsEditables},
            {workSpaceOptions2: ' ', subObjectEditableProperties: workspaceOptionsEditables2}]
        let buttonStyles = [ { label: "Cancel", key: Clutter.KEY_Escape, action: function(){this.returnObject=false, this.close(true)} }, { label: "Done", default: true }];

        let editObjectChooseDialog = new uiUtils.ObjectEditorDialog("Editing: "+worksetIn.WorksetName, (returnObject) => {
            if (!returnObject) return;
            returnObject.WorksetName = returnObject.WorksetName.trim();
            if (returnObject.WorksetName == '') return;

            // Update workspace maps - this currently overrides any previous worksets assigned to the workspace
            Object.assign(returnObject.workSpaceOptions, returnObject.workSpaceOptions2);
            returnObject.workSpaceOptions.forEachEntry(function(workSpaceOptionsKey, workSpaceOptionsValue, i) {
                if (this.workspaceMaps[workSpaceOptionsKey] == undefined)
                    Object.assign(this.workspaceMaps, {[workSpaceOptionsKey]: {'defaultWorkset':'', "currentWorkset": ''}});

                if (workSpaceOptionsValue == true)
                    this.workspaceMaps[workSpaceOptionsKey].defaultWorkset = returnObject.WorksetName;
                else if (workSpaceOptionsValue == false && this.workspaceMaps[workSpaceOptionsKey].defaultWorkset == returnObject.WorksetName)
                    this.workspaceMaps[workSpaceOptionsKey].defaultWorkset = '';
            }, this);

            // Update the name on the maps if it has changed
            this.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues) {
                if (workspaceMapValues.defaultWorkset == worksetIn.WorksetName)
                    this.workspaceMaps[workspaceMapKey].defaultWorkset = returnObject.WorksetName;
                if (workspaceMapValues.currentWorkset == worksetIn.WorksetName)
                    this.workspaceMaps[workspaceMapKey].currentWorkset = returnObject.WorksetName;
            }, this);

            // Update workset name and favorite state
            this.Worksets.forEach(function (workset, worksetIndex) {
                if (workset.WorksetName == worksetIn.WorksetName) {
                    // Update if default
                    if (this.activeSession.Default == this.Worksets[worksetIndex].WorksetName)
                        this.activeSession.Default = returnObject.WorksetName;
                    this.Worksets[worksetIndex].WorksetName = returnObject.WorksetName;
                    this.Worksets[worksetIndex].Favorite = returnObject.Favorite;
                }
            }, this);

            this.applySession();
            Me.workspaceManager.loadDefaultWorksets();
            uiUtils.showUserNotification("Changes saved.");
        }, editable, editables, buttonStyles);
        } catch(e) { dev.log(e) }
    }
    deleteWorkset(workset) {
        try {
        let backupFilename = this.saveWorkset(workset, true);
        // Remove it as the default on any workspace
        this.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues) {
            if (workspaceMapValues.defaultWorkset == workset.WorksetName)
                this.workspaceMaps[workspaceMapKey].defaultWorkset = '';
            if (workspaceMapValues.currentWorkset == workset.WorksetName)
                this.workspaceMaps[workspaceMapKey].currentWorkset = '';
        }, this);

        this.Worksets = this.Worksets.filter(item => item !== workset);
        this.saveSession();
        uiUtils.showUserNotification("Environment removed from session and backup saved to "+backupFilename, true);
        } catch(e) { dev.log(e) }
    }
    setDefaultWorkset(workset) {
        try {
        let name = workset.WorksetName || workset;
        this.activeSession.Default = name;
        if (this.workspaceMaps['Workspace'+Me.workspaceManager.activeWorkspaceIndex].currentWorkset == '')
            Me.session.displayWorkset(Me.session.DefaultWorkset, false, true);
        this.saveSession();
        } catch(e) { dev.log(e) }
    }

    // Storage management
    loadObject() {
        try {
        let worksetsDirectory = fileUtils.CONF_DIR + '/envbackups';
        let loadObjectDialog = new uiUtils.ObjectInterfaceDialog("Select a backup to load in to the session", (returnObject) => {
            if (returnObject.WorksetName) {
                let exists = false;
                this.Worksets.forEach(function (worksetBuffer) {
                    if (worksetBuffer.WorksetName == returnObject.WorksetName) {
                        exists = true;
                        uiUtils.showUserNotification("Environment with name '"+returnObject.WorksetName+"' already exists.");
                    }
                }, this);
                if (exists) return;

                this.Worksets.push(returnObject);
                this.saveSession();
                uiUtils.showUserNotification("Loaded "+returnObject.WorksetName+" from file and added to active session.");
            }

        }, false, true, [worksetsDirectory], [{WorksetName: 'Worksets'}]);
        } catch(e) { dev.log(e) }
    }
    saveWorkset(workset, backup=false) {
        try {
        if (utils.isEmpty(workset)) return;

        let timestamp = new Date().toLocaleString().replace(/[^a-zA-Z0-9-. ]/g, '').replace(/ /g, '');
        let filename = (backup ? 'env-'+workset.WorksetName+'-'+timestamp+'.json' : 'env-'+workset.WorksetName+'.json');

        fileUtils.saveToFile(workset, filename, fileUtils.CONF_DIR+'/envbackups');
        if (!backup) uiUtils.showUserNotification("Environment saved to "+filename);

        return filename;
        } catch(e) { dev.log(e) }
    }
};