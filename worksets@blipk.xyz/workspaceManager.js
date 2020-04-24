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
const Main = imports.ui.main;
const Gettext = imports.gettext;
const Workspace = imports.ui.workspace;
const { GObject, Meta, Wnck, Shell } = imports.gi;

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const utils = Me.imports.utils;
const dev = Me.imports.devUtils;

var WorkspaceManager = class WorkspaceManager { 
    constructor() {
        try {
        this.workspaceChangeHandler = null;
        Me.workspaceManager = this;
        this.workspaceChangeHandler = global.window_manager.connect('switch-workspace', ()=> { this._activeWorkspaceChanged() })

        // Clean active worksets from previous session
        Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
            Me.session.activeSession.workspaceMaps[workspaceMapKey].currentWorkset = '';
        }, this);

        this.workspaceUpdate();
        this.loadDefaultWorksets();
        this.workspaceUpdate();
        } catch(e) { dev.log(e) }
    }
    destroy() {
        try {
        this.switchToWorkspace(0);
        this._cleanWorkspaces(true);
        global.window_manager.disconnect(this.workspaceChangeHandler);
        } catch(e) { dev.log(e) }
    }
    _activeWorkspaceChanged() {
        try {
        this.workspaceUpdate();
        let foundActive = false;
        //Loop through worksets and load the one which is set to current
        Me.session.activeSession.Worksets.forEach(function (workset, worksetIndex) {
            Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, mapIndex) {
                if (workspaceMapValues.currentWorkset == workset.WorksetName && this.activeWorkspaceIndex == mapIndex) {
                    foundActive = true;
                    Me.session.displayWorkset(Me.session.activeSession.Worksets[worksetIndex]);
                }
            }, this);
        }, this);

        //If there's not any active on the workspace, load any that are set to default here
        if (foundActive === false) this.loadDefaultWorksets();
        this.workspaceUpdate();
        } catch(e) { dev.log(e) }
    }
    workspaceUpdate() {
        try {    
        this._cleanWorkspaces();
        } catch(e) { dev.log(e) }
    }
    loadDefaultWorksets(){
        try {
        Me.session.activeSession.Worksets.forEach(function (workset, worksetIndex) {
            Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
                if (workspaceMapValues.defaultWorkset == workset.WorksetName && workspaceMapValues.currentWorkset == '') {
                    Me.session.displayWorkset(Me.session.activeSession.Worksets[worksetIndex]);
                    Me.session.activeSession.workspaceMaps[workspaceMapKey].currentWorkset = workset.WorksetName;
                }
            }, this);
        }, this);
        } catch(e) { dev.log(e) }
    }
    getWorkspaceWindows(workspaceIndex) {
        try {
        if (utils.isEmpty(workspaceIndex)) workspaceIndex = Me.gWorkspaceManager.get_active_workspace_index();

        let workspace = Me.gWorkspaceManager.get_workspace_by_index(workspaceIndex);
        let windows = workspace.list_windows();
        windows = windows.filter(function(w) { return !w.is_skip_taskbar() && !w.is_on_all_workspaces(); });
        return windows;
        } catch(e) { dev.log(e) }
    }
    get activeWorkspace() {
        this.workspaceUpdate();
        return Me.gWorkspaceManager.get_active_workspace();
    }
    get activeWorkspaceIndex() {
        this.workspaceUpdate();
        return Me.gWorkspaceManager.get_active_workspace_index();
    }
    get NumGlobalWorkspaces() {
        this.workspaceUpdate();
        return Me.gWorkspaceManager.n_workspaces;
    }
    get activeWorksetName() {
        try {
        this.workspaceUpdate();
        if (Me.session.activeSession.workspaceMaps['Workspace'+this.activeWorkspaceIndex] == undefined) {
            let obj = {['Workspace'+this.activeWorkspaceIndex]: {'defaultWorkset':'', "currentWorkset": ''}}
            Object.assign(Me.session.activeSession.workspaceMaps, obj);
            Me.session.saveSession();
        }
        return Me.session.activeSession.workspaceMaps['Workspace'+this.activeWorkspaceIndex].currentWorkset;
        } catch(e) { dev.log(e) }
    }
    set activeWorksetName(workset) {
        try {
        let name = workset.WorksetName || workset;
        this.workspaceUpdate();
        if (Me.session.activeSession.workspaceMaps['Workspace'+this.activeWorkspaceIndex] == undefined) {
            let obj = {['Workspace'+this.activeWorkspaceIndex]: {'defaultWorkset':'', "currentWorkset": name}}
            Object.assign(Me.session.activeSession.workspaceMaps, obj);
            Me.session.saveSession();
        } else {
            Me.session.activeSession.workspaceMaps['Workspace'+this.activeWorkspaceIndex].currentWorkset = name;
        }
        Me.session.saveSession();
        } catch(e) { dev.log(e) }
    }

    set lastWorkspaceActiveWorksetName(workset) {
        try {
        let name = workset.WorksetName || workset;
        this.workspaceUpdate();
        if (Me.session.activeSession.workspaceMaps['Workspace'+(this.NumGlobalWorkspaces-1)] == undefined) {
            let obj = {['Workspace'+(this.NumGlobalWorkspaces-1)]: {'defaultWorkset':'', "currentWorkset": name}}
            Object.assign(Me.session.activeSession.workspaceMaps, obj);
            Me.session.saveSession();
        } else {
            Me.session.activeSession.workspaceMaps['Workspace'+(this.NumGlobalWorkspaces-1)].currentWorkset = name;
        }
        Me.session.saveSession();
        } catch(e) { dev.log(e) }
    }

    getWorkspaceAppIds(workspaceIndex, excludeFavorites=true) {
        try {
        if (utils.isEmpty(workspaceIndex)) workspaceIndex = Me.gWorkspaceManager.get_active_workspace_index();

        let windowTracker = Shell.WindowTracker.get_default();
        let windows = this.getWorkspaceWindows(workspaceIndex);
        let appIDs = [];
        
        windows.forEach(function (w) {
            appIDs.push(windowTracker.get_window_app(w).get_id());
        }, this)

        //remove duplicates from apps with multiple windows
        appIDs = appIDs.filter(function(item, pos) {
            return appIDs.indexOf(item) === pos;
        }, this);

        //remove un-apped windows
        appIDs = appIDs.filter(function(item, pos) {
            if (item.match("window:")) return false;
            return true;
        }, this);

        if (excludeFavorites) {
            let favApps = global.settings.get_strv("favorite-apps");
            appIDs = appIDs.filter((item, pos) => {
                let ret = true;
                favApps.forEach(function(favItem){
                    if (item.match(favItem)) ret = false;
                }, this);
                return ret;
            }, this);
        }

        return appIDs;
        } catch(e) { dev.log(e) }
    }
    switchToWorkspace(index=0) {
        try {
        index = parseInt(index, 10);   
        this.workspaceUpdate();
        Me.gWorkspaceManager.get_workspace_by_index(index).activate(0);
        this.workspaceUpdate();
        } catch(e) { dev.log(e) }
    }
    _moveWindowsToWorkspace() {
        //TO DO        
    }
    _cleanWorkspaces(destroyClean=false) {
        try {
        // Remove any worksets that are set to current on more than one workspace
        let currents = [];
        Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
            if (workspaceMapValues.currentWorkset != '') {
                if (currents.indexOf(workspaceMapValues.currentWorkset) > -1)
                    Me.session.activeSession.workspaceMaps[i].currentWorkset = '';

                currents.push(workspaceMapValues.currentWorkset)
            }
        }, this);

        //minimum workspaces should equal the amount of active worksets
        let min_workspaces = 1;
        if (!destroyClean) {
            Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
                if (workspaceMapValues.currentWorkset != '') {
                    min_workspaces++;
                }
            }, this);
        }
        if (min_workspaces == 0) return;

        dev.log(min_workspaces);

        //first make all workspaces non-persistent
        for(let i = Me.gWorkspaceManager.n_workspaces-1; i >= 0; i--) {
            Me.gWorkspaceManager.get_workspace_by_index(i)._keepAliveId = false;
        }

        //if we have less than the minimum workspaces create new ones and make them persistent
        if(Me.gWorkspaceManager.n_workspaces < min_workspaces-1) {
            for(let i = 0; i < min_workspaces-1; i++) {
                if(i >= Me.gWorkspaceManager.n_workspaces) {
                    Me.gWorkspaceManager.append_new_workspace(false, global.get_current_time());
                }
                Me.gWorkspaceManager.get_workspace_by_index(i)._keepAliveId = true;    
            }
        } else { //if we already have enough workspaces make the first ones persistent
            for(let i = 0; i < min_workspaces-1; i++) {
                Me.gWorkspaceManager.get_workspace_by_index(i)._keepAliveId = true;
            }
        }
        
        //update the workspace view
        Main.wm._workspaceTracker._checkWorkspaces();
        } catch(e) { dev.log(e) }
    }
};