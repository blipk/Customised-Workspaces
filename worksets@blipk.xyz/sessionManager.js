/*
 * Worksets extension for Gnome 3
 * This file is part of the worksets extension for Gnome 3
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
const { GObject } = imports.gi;

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { utils, uiUtils, fileUtils } = Me.imports;
const { panelIndicator, workspaceManager, workspaceIsolater } = Me.imports;
const dev = Me.imports.devUtils;

class SessionManager {  
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
        let newFavorites = [];

        currentFavorites.forEach(function(favorite, i) {
            newFavorites.push({'name': favorite, 'displayName': this.allApps[favorite].displayName, 'icon': this.allApps[favorite].icon || '', 'exec': this.allApps[favorite].exec || '' })
        }, this);

        return newFavorites;
        } catch(e) { dev.log(e) }
    }
    _favoritesChanged() {
        try {
        this.activeSession.Worksets.forEach(function (worksetBuffer, worksetIndex) {
            if(worksetBuffer.WorksetName == Me.workspaceManager.activeWorksetName) {
                this.activeSession.Worksets[worksetIndex].FavApps = this.getFavorites(); 
            }
        }, this);
        } catch(e) { dev.log(e) }
    }
    scanInstalledApps() {
        let appPath = '/usr/share/applications/'
        let userAppPath = fileUtils.USER_DATA_DIR+'/applications/'
        let installedApps = fileUtils.enumarateDirectoryChildren(appPath)
        installedApps = installedApps.concat(fileUtils.enumarateDirectoryChildren(userAppPath))

        installedApps.forEach(function(app, i) {
            let fullAppPath = app.parentDirectory+app.fullname;
            let file = fileUtils.Gio.file_new_for_path(fullAppPath);
            let buffer = file.load_contents(null);
            let contents = fileUtils.ByteArray.toString(buffer[1]);

            let nameLoc = contents.indexOf("Name=");
            let execLoc = contents.indexOf("Exec=");
            let iconLoc = contents.indexOf("Icon=");

            this.allApps[app.fullname] = {'displayName': contents.substring(nameLoc+5, contents.indexOf("\n", nameLoc)),
                                                'icon': contents.substring(iconLoc+5, contents.indexOf("\n", iconLoc)), 
                                                'exec': contents.substring(execLoc+5, contents.indexOf("\n", execLoc)) };
        }, this);
    }
    displayWorkset(workset, loadInNewWorkspace=false) {
        try {
        if (Me.workspaceManager.activeWorksetName == workset.WorksetName) { //switch to it if already active
            Me.workspaceManager.switchToWorkspace(workset.activeWorkspaceIndex);
            uiUtils.showUserFeedbackMessage("Switched to active workset " + workset.WorksetName, true);
        } else {
            if (loadInNewWorkspace) { //create and open new workspace before loading workset
                Me.workspaceManager.workspaceUpdate();
                Me.workspaceManager.switchToWorkspace(Me.workspaceManager.NumGlobalWorkspaces-1); 
            }
            uiUtils.showUserFeedbackMessage("Loaded workset " + workset.WorksetName, true);
        }
        //Apply workset changes to workspace
        Me.workspaceManager.activeWorksetName = workset.WorksetName;
        this.setFavorites(workset.FavApps);
        this.setBackground(workset.BackgroundImage);
        } catch(e) { dev.log(e) }
    }

    // Workset Management
    setWorksetBackgroundImage(workset) {
        try {
        utils.spawnWithCallback(null, ['/usr/bin/zenity', '--file-selection', '--title=Choose New Background for Workset'],  fileUtils.GLib.get_environ(), 0, null,
        (resource) => {
            try {
            if (!resource) return;
            resource = resource.trim();
            let filePath = fileUtils.GLib.path_get_dirname(resource);
            let fileName = fileUtils.GLib.path_get_basename(resource);

            // Find the workset and update the background image path property
            Me.session.activeSession.Worksets.forEach(function (worksetBuffer, worksetIndex) {
                if (worksetBuffer.WorksetName != workset.WorksetName) return;
                Me.session.activeSession.Worksets[worksetIndex].BackgroundImage = resource;
                Me.session.saveSession();
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
            sessionObject.Worksets[0].WorksetName = "Primary Workset";
            sessionObject.Worksets[0].Favorite = true;
            sessionObject.Worksets[0].BackgroundImage = this.getBackground();
            sessionObject.workspaceMaps = workspaceMaps; // TO DO - set up 
            sessionObject.workspaceMaps['Workspace0'].defaultWorkset = "Primary Workset";
            sessionObject.workspaceMaps['Workspace0'].currentWorkset = "Primary Workset";
        } else {
            sessionObject.SessionName = "Default";
            sessionObject.Worksets[0].WorksetName = "New Workset";
            sessionObject.workspaceMaps = workspaceMaps;
            sessionObject.workspaceMaps['Workspace0'].defaultWorkset = "New Workset";
            sessionObject.workspaceMaps['Workspace0'].currentWorkset = "New Workset";
        }
        //Load the session
        this.loadSession(sessionObject);
        } catch(e) { dev.log(e) }
    }
    newObject(){
        try {
        let options =  [[{option: "New workset in current session", value: 0}],
                        [{option: "New session", value: 2}]];

        let getNewOptionDialog = new uiUtils.ObjectInterfaceDialog("What would you like to create?", (returnOption) => {
                switch(returnOption.value) {
                    case 0: this.newWorkset(); break;
                    case 2: this.newSession(true, true); break;
                    default:
                }
        }, false, true, options, [{option: ' '}]);
        } catch(e) { dev.log(e) }
    }
    newWorkset(name, fromEnvironment=true) {
        try {
        //Create new workset object from protoype in gschema
        let worksetObject = JSON.parse(Me.settings.get_string("workset-prototype-json"));
        let currentFavoriteApplications = this.getFavorites();
        let currentRunningApplications = this.getFavorites(Me.workspaceManager.getWorkspaceAppIds());

        if (fromEnvironment) {
            //Build on prototype from current environment, add all current FavApps+RunningApps to it
            worksetObject.FavApps = currentFavoriteApplications.concat(currentRunningApplications);
            worksetObject.Favorite = true;
            sessionObject.Worksets[0].BackgroundImage = this.getBackground();
        } else {
            //Blank prototype with no FavApps
            worksetObject.FavApps = [];
            worksetObject.Favorite = false;
            sessionObject.Worksets[0].BackgroundImage = this.getBackground();
        }

        if (!name) {
            let getNewWorksetNameDialog = new uiUtils.ObjectInterfaceDialog("Please enter name for new workset.", (returnText) => {
                worksetObject.WorksetName = returnText;
                uiUtils.showUserFeedbackMessage("Workset "+returnText+" created.");
            });
        } else {
            worksetObject.WorksetName = name;
        }
        
        //Push it to the session
        this.activeSession.Worksets.push(worksetObject);
        } catch(e) { dev.log(e) }
    }
    
    //Storage management
    showObjectManager() {
        try {
        if (utils.isEmpty(this.activeSession)) return;

        let worksetObjects = [];
        this.activeSession.Worksets.forEach(function (worksetBuffer, worksetIndex) {
            worksetObjects.push(this.activeSession.Worksets[worksetIndex]);
        }, this);
        
        let editObjectChooseDialog = new uiUtils.ObjectInterfaceDialog("Please select a workset to edit.", (returnObject) => {
            let editObjectChooseDialog = new uiUtils.ObjectEditorDialog("Properties of the object.", () => {
                    uiUtils.showUserFeedbackMessage("Changes have been saved.");
            }, returnObject, [{WorksetName: 'Workset Name'}, {DefaultWorkspaceIndex: 'Load on workspace X by default'}, {Favorite: 'Favorite'}, {SessionName: 'Collection Name'}]);

        }, false, true, [this.activeSession, worksetObjects], [{SessionName: 'Collections'},{WorksetName: 'Worksets'}]);
        } catch(e) { dev.log(e) }
    }
    loadObject() {
        try {
        let worksetsDirectory = fileUtils.CONF_DIR + '/worksets';
        let loadObjectDialog = new uiUtils.ObjectInterfaceDialog("Please select a previously workset to load from disk.", (returnObject) => {
            if (returnObject.WorksetName) {
                this.activeSession.Worksets.push(returnObject);
                uiUtils.showUserFeedbackMessage("Workset loaded from file and added to active session.");  
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
        let filename = (backup ? 'workset-'+workset.WorksetName+'-'+timestamp+'.json' : 'workset-'+workset.WorksetName+'.json');

        fileUtils.saveJSObjectToFile(workset, filename, fileUtils.CONF_DIR+'/worksets');
        if (!backup) uiUtils.showUserFeedbackMessage("Workset saved to "+filename);

        return filename;
        } catch(e) { dev.log(e) }
    }
};