/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) 2020 A.D. - http://kronosoul.xyz
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

// External imports
const AppFavorites = imports.ui.appFavorites;
const Main = imports.ui.main;
const extensionUtils = imports.misc.extensionUtils;
const { GObject, Gio, Clutter, Shell } = imports.gi;

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { utils, uiUtils, fileUtils } = Me.imports;
const { panelIndicator, workspaceManager, workspaceIsolater } = Me.imports;
const dev = Me.imports.devUtils;


var SessionManager = class SessionManager {  
    constructor () {
        try {
        Me.session = this;

        this.activeSession = null;
        this.favoritesChangeHandler = null;
        this.allApps = {};

        //Create sesion or initialize from session file if it exists
        if (fileUtils.checkExists(fileUtils.CONF_DIR + '/session.json')) {
            let obj = fileUtils.loadJSObjectFromFile('session.json', fileUtils.CONF_DIR);
            this._setup(obj);
        } else {
            this.newSession(true);
            this._setup(this.activeSession);
        }
        } catch(e) { dev.log(e) }
    }
    _setup(sessionObject) {
        try {
        if (!utils.isEmpty(sessionObject)) {
            this.activeSession = sessionObject;
            this._cleanWorksets();

            this.favoritesChangeHandler = AppFavorites.getAppFavorites().connect('changed', ()=>{this._favoritesChanged()})
            Me.workspaceManager = new workspaceManager.WorkspaceManager();

            Me.worksetsIndicator = new panelIndicator.WorksetsIndicator();
            Main.panel.addToStatusArea('WorksetsIndicator', Me.worksetsIndicator, 1);

            this.saveSession();
        }
        } catch(e) { dev.log(e) }
    }
    _cleanWorksets() {
        try {
        if (typeof this.activeSession.SessionName !== 'string') this.activeSession.SessionName = "Session " + i;
        if (typeof this.activeSession.Favorite !== 'boolean') this.activeSession.Favorite = false;

        // Clean active worksets from previous session
        this.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
            this.activeSession.workspaceMaps[workspaceMapKey].currentWorkset = '';
        }, this);

        let filteredWorksets;
        this.activeSession.Worksets.forEach(function (worksetBuffer, ii) {
            //Fix entries
            if (!Array.isArray(worksetBuffer.FavApps)) worksetBuffer.FavApps = [];
            if (typeof worksetBuffer.WorksetName !== 'string') worksetBuffer.WorksetName = "Workset " + ii;
            if (typeof worksetBuffer.Favorite !== 'boolean') worksetBuffer.Favorite = false;

            // Remove duplicate entries
            filteredWorksets = this.activeSession.Worksets.filter(function(item) {                    
                if (item !== worksetBuffer &&
                    (JSON.stringify(item) === JSON.stringify(worksetBuffer)))
                    { return false; }
                return true;
            }, this);
        }, this);

        // Apply
        this.activeSession.Worksets = filteredWorksets;

        this.saveSession();
        } catch(e) { dev.log(e) }
    }
    destroy() {
        try {
        this.saveSession();
        if (this.favoritesChangeHandler) {AppFavorites.getAppFavorites().disconnect(this.favoritesChangeHandler)};
        } catch(e) { dev.log(e) }
    }
    getBackground() {
        try{
        let dSettings = extensionUtils.getSettings('org.gnome.desktop.background');
        let bgURI = dSettings.get_string('picture-uri');
        return bgURI.replace("file://", "");
        } catch(e) { dev.log(e) }
    }
    setBackground(bgPath) {
        bgPath = bgPath.replace("file://", "");
        let dSettings = extensionUtils.getSettings('org.gnome.desktop.background');
        dSettings.set_string('picture-uri', 'file://'+bgPath);
    }
    setFavorites(favArray) {
        try {
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
        this.activeSession.Worksets.forEach(function (worksetBuffer, i) {
            if (worksetBuffer.WorksetName == workset.WorksetName) {
                this.activeSession.Worksets[i].FavApps = worksetBuffer.FavApps.filter(favApps => favApps.name != appid)
                if (Me.workspaceManager.activeWorksetName == workset.WorksetName)
                    this.setFavorites(this.activeSession.Worksets[i].FavApps);
                return;
            }
        }, this);
        this.saveSession();
        } catch(e) { dev.log(e) }
    }
    _favoritesChanged() {
        try {
        this.activeSession.Worksets.forEach(function (worksetBuffer, worksetIndex) {
            if(worksetBuffer.WorksetName == Me.workspaceManager.activeWorksetName) {
                this.activeSession.Worksets[worksetIndex].FavApps = this.getFavorites(); 
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
            let name = app.get_name() || app.get_display_name() || 'Unkown App Name';
            let exec = app.get_string("Exec");
            let icon = '';
            if (app.get_icon()) icon = app.get_icon().to_string();
            this.allApps[id] = {'displayName': name, 'icon': icon, 'exec': exec };
        }, this);
    }
    displayWorkset(workset, loadInNewWorkspace=false) {
        try {
        let isActive = -1;
        this.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues) {
            if (workspaceMapValues.currentWorkset == workset.WorksetName) {
                isActive = parseInt(workspaceMapKey.substr(-1, 1));
                return;
            }
        }, this);
        
        if (isActive > -1) { //switch to it if already active
            if (Me.workspaceManager.activeWorkspaceIndex != isActive) Me.workspaceManager.switchToWorkspace(isActive);
            uiUtils.showUserFeedbackMessage("Switched to active environment " + workset.WorksetName, true);
        } else {
            if (loadInNewWorkspace) { //create and open new workspace before loading workset
                //Me.workspaceManager.lastWorkspaceActiveWorksetName = workset.WorksetName;
                Me.workspaceManager.workspaceUpdate();
                Me.workspaceManager.switchToWorkspace(Me.workspaceManager.NumGlobalWorkspaces-1);
            }
            Me.workspaceManager.activeWorksetName = workset.WorksetName;
            uiUtils.showUserFeedbackMessage("Loaded environment " + workset.WorksetName, true);
        }

        this.setFavorites(workset.FavApps);
        this.setBackground(workset.BackgroundImage);

        this.saveSession();
        } catch(e) { dev.log(e) }
    }
    closeWorkset(workset) {
        try {
            this.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues) {
                if (workspaceMapValues.currentWorkset == workset.WorksetName)
                    this.activeSession.workspaceMaps[workspaceMapKey].currentWorkset = '';
            }, this);

            this.saveSession();
        } catch(e) { dev.log(e) }
    }

    // Workset Management
    setWorksetBackgroundImage(workset) {
        try {
        utils.spawnWithCallback(null, ['/usr/bin/zenity', '--file-selection', '--title=Choose New Background'],  fileUtils.GLib.get_environ(), 0, null,
        (resource) => {
            try {
            if (!resource) return;
            resource = resource.trim();
            let filePath = fileUtils.GLib.path_get_dirname(resource);
            let fileName = fileUtils.GLib.path_get_basename(resource);

            // Find the workset and update the background image path property
            this.activeSession.Worksets.forEach(function (worksetBuffer, worksetIndex) {
                if (worksetBuffer.WorksetName != workset.WorksetName) return;
                this.activeSession.Worksets[worksetIndex].BackgroundImage = resource;
                this.saveSession();
            }, this);

            uiUtils.showUserFeedbackMessage("Background Image Changed", true)
            if (Me.workspaceManager.activeWorksetName == workset.WorksetName) this.setBackground(resource);
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
    newWorkset(name, fromEnvironment=true) {
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
            let buttonStyles = [ { label: "Cancel", key: Clutter.KEY_Escape, action: function(){this.close(' ')} }, { label: "Done", default: true }];
            let getNewWorksetNameDialog = new uiUtils.ObjectInterfaceDialog("Please enter name for the new custom workspace:", (returnText) => {
                if (!returnText) return;
                returnText = returnText.trim();
                if (returnText == '') return;

                let exists = false;
                this.activeSession.Worksets.forEach(function (worksetBuffer) {
                    if (worksetBuffer.WorksetName == returnText) {
                        exists = true;
                        uiUtils.showUserFeedbackMessage("Environment with name '"+returnText+"' already exists.");
                    }
                }, this);
                if (exists) return;

                worksetObject.WorksetName = returnText;
                
                //Push it to the session
                this.activeSession.Worksets.push(worksetObject);
                this.saveSession();

                uiUtils.showUserFeedbackMessage("Environment "+returnText+" created.");
            }, true, false, [], [], buttonStyles);
        } else {
            worksetObject.WorksetName = name;
            //Push it to the session
            this.activeSession.Worksets.push(worksetObject);
            this.saveSession();
        }
        
        
        } catch(e) { dev.log(e) }
    }
    editWorkset(worksetIn) {
        try {
        let editable = {};
        Object.assign(editable, worksetIn);
        let workSpaceOptions = {Workspace0: false, Workspace1: false, Workspace2: false, Workspace3: false, Workspace4: false};
        let workSpaceOptions2 = {Workspace5: false, Workspace6: false, Workspace7: false, Workspace8: false, Workspace9: false};
        this.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
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

            // Update workset name and favorite state
            this.activeSession.Worksets.forEach(function (workset, worksetIndex) {
                if (workset.WorksetName == worksetIn.WorksetName) {
                    this.activeSession.Worksets[worksetIndex].WorksetName = returnObject.WorksetName;
                    this.activeSession.Worksets[worksetIndex].Favorite = returnObject.Favorite;
                }
            }, this);

            // Update workspace maps - this currently overrides any previous worksets assigned to the workspace
            Object.assign(returnObject.workSpaceOptions, returnObject.workSpaceOptions2);
            returnObject.workSpaceOptions.forEachEntry(function(workSpaceOptionsKey, workSpaceOptionsValue, i) {
                if (this.activeSession.workspaceMaps[workSpaceOptionsKey] == undefined) 
                    Object.assign(this.activeSession.workspaceMaps, {[workSpaceOptionsKey]: {'defaultWorkset':'', "currentWorkset": ''}});

                if (workSpaceOptionsValue == true)
                    this.activeSession.workspaceMaps[workSpaceOptionsKey].defaultWorkset = returnObject.WorksetName;
                else if (workSpaceOptionsValue == false && this.activeSession.workspaceMaps[workSpaceOptionsKey].defaultWorkset == returnObject.WorksetName)
                    this.activeSession.workspaceMaps[workSpaceOptionsKey].defaultWorkset = '';
            }, this);


            // Update the name on the maps if it has changed
            this.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues) {
                if (workspaceMapValues.defaultWorkset == worksetIn.WorksetName)
                    this.activeSession.workspaceMaps[workspaceMapKey].defaultWorkset = returnObject.WorksetName;
                if (workspaceMapValues.currentWorkset == worksetIn.WorksetName)
                    this.activeSession.workspaceMaps[workspaceMapKey].currentWorkset = returnObject.WorksetName;
            }, this);
            
            this.saveSession();
            Me.workspaceManager.loadDefaultWorksets();
            uiUtils.showUserFeedbackMessage("Changes saved.");
        }, editable, editables, buttonStyles);
        } catch(e) { dev.log(e) }
    }
    deleteWorkset(workset) {
        try {
        let backupFilename = this.saveWorkset(workset, true);
        // Remove it as the default on any workspace
        this.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues) {
            if (workspaceMapValues.defaultWorkset == workset.WorksetName)
            this.activeSession.workspaceMaps[workspaceMapKey].defaultWorkset = '';
        }, this);

        this.activeSession.Worksets = this.activeSession.Worksets.filter(item => item !== workset);
        this.saveSession();
        uiUtils.showUserFeedbackMessage("Environment removed from session and backup saved to "+backupFilename, true);
        } catch(e) { dev.log(e) }
    }
    
    //Storage management
    loadObject() {
        try {
        let worksetsDirectory = fileUtils.CONF_DIR + '/envbackups';
        let loadObjectDialog = new uiUtils.ObjectInterfaceDialog("Select a backup to load in to the session", (returnObject) => {
            if (returnObject.WorksetName) {
                let exists = false;
                this.activeSession.Worksets.forEach(function (worksetBuffer) {
                    if (worksetBuffer.WorksetName == returnObject.WorksetName) {
                        exists = true;
                        uiUtils.showUserFeedbackMessage("Environment with name '"+returnObject.WorksetName+"' already exists.");
                    }
                }, this);
                if (exists) return;

                this.activeSession.Worksets.push(returnObject);
                this.saveSession();
                uiUtils.showUserFeedbackMessage("Loaded "+returnObject.WorksetName+" from file and added to active session.");  
            }
            
        }, false, true, [worksetsDirectory], [{WorksetName: 'Worksets'}]);
        } catch(e) { dev.log(e) }
    }
    loadSession(sessionsObject, restore=false) {
        try {
        if (sessionsObject) {
            this.activeSession = sessionsObject;
        } else {
            let filename = (restore ? 'session-backup.json' : 'session.json');
            let sessionObj = fileUtils.loadJSObjectFromFile(filename, fileUtils.CONF_DIR);
            if (!utils.isEmpty(sessionObj)) /*&& utils.isEmpty(this.activeSession)*/ 
                this.activeSession = sessionObj;
        }
        } catch(e) { dev.log(e) }
    }
    saveSession(backup=false) {
        try {
        if (utils.isEmpty(this.activeSession)) return;

        let sessionCopy = JSON.parse(JSON.stringify(this.activeSession));

        let timestamp = new Date().toLocaleString().replace(/[^a-zA-Z0-9-. ]/g, '').replace(/ /g, '');
        let filename = (backup ? 'session-backup-'+timestamp+'.json' : 'session.json');
        fileUtils.saveJSObjectToFile(sessionCopy, filename, fileUtils.CONF_DIR);
        } catch(e) { dev.log(e) }
    }
    saveWorkset(workset, backup=false) {
        try {
        if (utils.isEmpty(workset)) return;

        let timestamp = new Date().toLocaleString().replace(/[^a-zA-Z0-9-. ]/g, '').replace(/ /g, '');
        let filename = (backup ? 'env-'+workset.WorksetName+'-'+timestamp+'.json' : 'env-'+workset.WorksetName+'.json');

        fileUtils.saveJSObjectToFile(workset, filename, fileUtils.CONF_DIR+'/envbackups');
        if (!backup) uiUtils.showUserFeedbackMessage("Environment saved to "+filename);

        return filename;
        } catch(e) { dev.log(e) }
    }
};
