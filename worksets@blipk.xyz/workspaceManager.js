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

// External imports
import GLib from "gi://GLib"
import Meta from "gi://Meta"
import Shell from "gi://Shell"

import * as Main from "resource:///org/gnome/shell/ui/main.js"
// import * as workspace from "resource:///org/gnome/shell/ui/workspace.js"
// import * as extensionUtils from "resource:///org/gnome/shell/misc/extensionUtils.js"

// Internal imports
import { WorksetsInstance as Me } from "./extension.js"
import * as dev from "./dev.js"
import * as utils from "./utils.js"
import * as workspaceIsolater from "./workspaceIsolater.js"

export class WorkspaceManager {
    constructor() {
        try {
            Me.workspaceManager = this
            this.signals = new utils.SignalHandler()
            this.signals.add( global.window_manager, "switch-workspace", this._activeWorkspaceChanged.bind( this ) )

            this.loadDefaults = true
            this.noUpdate = false

            this.activateIsolater( true )
            this._workspaceUpdate()
            this.loadDefaultWorksets()
            this._workspaceUpdate()
        } catch ( e ) { dev.log( e ) }
    }
    destroy() {
        try {
            this.switchToWorkspace( 0 )
            this._workspaceUpdate( true )
            this.signals.destroy()
        } catch ( e ) { dev.log( e ) }
    }
    _workspaceUpdate( destroyClean = false ) {
        if ( this.noUpdate ) return
        try {
            let min_workspaces = 1

            let currents = []
            Me.session.workspaceMaps.forEachEntry( function ( workspaceMapKey, workspaceMapValues, i ) {
                // Remove any worksets that are set to current on more than one workspace
                if ( workspaceMapValues.currentWorkset != "" ) {
                    if ( currents.indexOf( workspaceMapValues.currentWorkset ) > -1 ) {
                        Me.session.workspaceMaps[workspaceMapKey].currentWorkset = ""
                    }

                    currents.push( workspaceMapValues.currentWorkset )
                }

                // Minimum workspaces should be one more than the workspace index that the last active workset is on
                if ( !destroyClean ) {
                    let index = parseInt( workspaceMapKey.substr( -1, 1 ) )
                    if ( workspaceMapValues.currentWorkset != "" && index > min_workspaces - 2 ) {
                        min_workspaces = index + 2
                    }

                }
            }, this )

            if ( min_workspaces < 2 ) min_workspaces = 2


            const currentWorkspaces = []
            const n_global_workspaces = Me.gWorkspaceManager.n_workspaces

            // Make all workspaces non-persistent
            for ( let i = n_global_workspaces - 1; i >= 0; i-- ) {
                currentWorkspaces[i] = Me.gWorkspaceManager.get_workspace_by_index( i )
                currentWorkspaces[i]._keepAliveId = false
            }


            for ( let i = 0; i < min_workspaces - 1; i++ ) {
                if ( !currentWorkspaces[i] ) {
                    dev.log( `Could not find expected workspace at index ${i}` )
                    return
                }

                // If we have less than the minimum workspaces create new ones
                if ( n_global_workspaces < min_workspaces - 1 ) {
                    if ( i >= n_global_workspaces ) {
                        Me.gWorkspaceManager.append_new_workspace( false, global.get_current_time() )
                    }
                }

                // Make all workspaces persistent again
                currentWorkspaces[i]._keepAliveId = true
            }


            // Update the workspace view
            Main.wm._workspaceTracker._checkWorkspaces()
        } catch ( e ) { dev.log( e ) }
    }
    _activeWorkspaceChanged() {
        try {
            this._workspaceUpdate()
            let foundActive = false
            //Loop through worksets and load the one which is set to current
            Me.session.Worksets.forEach( function ( workset, worksetIndex ) {
                if ( Me.session.workspaceMaps["Workspace" + this.activeWorkspaceIndex].currentWorkset == workset.WorksetName ) {
                    foundActive = workset.WorksetName
                    Me.session.displayWorkset( Me.session.Worksets[worksetIndex] )
                }
            }, this )

            // If there's not any active on the workspace,
            // load any that are set to default here, or just display the background/favourites from the default
            if ( foundActive === false ) this.loadDefaultWorksets()

            this._workspaceUpdate()

            // Update the overlay
            if ( Me.workspaceViewManager ) Me.workspaceViewManager.refreshOverview()
        } catch ( e ) { dev.log( e ) }
    }
    loadDefaultWorksets() {
        try {
            if ( !this.loadDefaults ) return

            let found = false
            Me.session.Worksets.forEach( function ( workset, worksetIndex ) {
                let map = Me.session.workspaceMaps["Workspace" + this.activeWorkspaceIndex]
                if ( map.currentWorkset == workset.WorksetName ||
                    ( map.currentWorkset == "" && map.defaultWorkset == workset.WorksetName ) ) {
                    Me.session.displayWorkset( Me.session.Worksets[worksetIndex] )
                    Me.session.workspaceMaps["Workspace" + this.activeWorkspaceIndex].currentWorkset = workset.WorksetName
                    found = true
                }
            }, this )

            if ( !found ) Me.session.displayWorkset( Me.session.DefaultWorkset, false, true )
        } catch ( e ) { dev.log( e ) }
    }
    getWorkspaceWindows( workspaceIndex ) {
        try {
            if ( utils.isEmpty( workspaceIndex ) ) workspaceIndex = Me.gWorkspaceManager.get_active_workspace_index()

            const workspace = Me.gWorkspaceManager.get_workspace_by_index( workspaceIndex )
            const windows = workspace
                .list_windows()
                .filter( function ( w ) { return !w.is_skip_taskbar() && !w.is_on_all_workspaces() } )
            return windows
        } catch ( e ) { dev.log( e ) }
    }
    get activeWorkspace() {
        this._workspaceUpdate()
        return Me.gWorkspaceManager.get_active_workspace()
    }
    get activeWorkspaceIndex() {
        this._workspaceUpdate()
        return Me.gWorkspaceManager.get_active_workspace_index()
    }
    get NumGlobalWorkspaces() {
        this._workspaceUpdate()
        return Me.gWorkspaceManager.n_workspaces
    }
    get activeWorksetName() {
        try {
            this._workspaceUpdate()
            if ( Me.session.workspaceMaps["Workspace" + this.activeWorkspaceIndex] == undefined ) {
                let obj = { ["Workspace" + this.activeWorkspaceIndex]: { "defaultWorkset": "", "currentWorkset": "" } }
                Object.assign( Me.session.workspaceMaps, obj )
                Me.session.saveSession()
            }
            return Me.session.workspaceMaps["Workspace" + this.activeWorkspaceIndex].currentWorkset
        } catch ( e ) { dev.log( e ) }
    }
    set activeWorksetName( workset ) {
        try {
            let name = workset.WorksetName || workset
            this._workspaceUpdate()
            if ( Me.session.workspaceMaps["Workspace" + this.activeWorkspaceIndex] == undefined ) {
                let obj = { ["Workspace" + this.activeWorkspaceIndex]: { "defaultWorkset": "", "currentWorkset": name } }
                Object.assign( Me.session.workspaceMaps, obj )
            } else {
                Me.session.workspaceMaps["Workspace" + this.activeWorkspaceIndex].currentWorkset = name
            }
            Me.session.saveSession()
        } catch ( e ) { dev.log( e ) }
    }
    set lastWorkspaceActiveWorksetName( workset ) {
        try {
            let name = workset.WorksetName || workset
            this._workspaceUpdate()
            if ( Me.session.workspaceMaps["Workspace" + ( this.NumGlobalWorkspaces - 1 )] == undefined ) {
                let obj = { ["Workspace" + ( this.NumGlobalWorkspaces - 1 )]: { "defaultWorkset": "", "currentWorkset": name } }
                Object.assign( Me.session.workspaceMaps, obj )
            } else {
                Me.session.workspaceMaps["Workspace" + ( this.NumGlobalWorkspaces - 1 )].currentWorkset = name
            }
            Me.session.saveSession()
        } catch ( e ) { dev.log( e ) }
    }

    getWorkspaceAppIds( workspaceIndex, excludeFavorites = true ) {
        try {
            if ( utils.isEmpty( workspaceIndex ) ) workspaceIndex = Me.gWorkspaceManager.get_active_workspace_index()

            const windowTracker = Shell.WindowTracker.get_default()
            const windows = this.getWorkspaceWindows( workspaceIndex )
            let appIDs = []

            windows.forEach( function ( w ) {
                let id = windowTracker.get_window_app( w ).get_id()

                // Snap installed applications are launched as window backed,
                // so need to get the hint that is set for ubuntus BAMF daemon from the apps environment vars
                // Possible alternative if the BAMF method proves unreliable: Shell.AppSystem.search(w.get_wm_class_instance())
                if ( id.indexOf( "window:" ) > -1 ) {
                    let env = GLib.spawn_command_line_sync( "ps e " + w.get_pid() )[1].toString().toLowerCase()
                    let bamfHint = env.substring( env.indexOf( "bamf_desktop_file_hint=" ) + 23, env.indexOf( ".desktop" ) + 8 )
                    id = GLib.path_get_basename( bamfHint )
                }

                appIDs.push( id )
            }, this )

            //remove duplicates from apps with multiple windows
            appIDs = appIDs.filter( function ( item, pos ) {
                return appIDs.indexOf( item ) === pos
            }, this )

            //remove un-apped windows
            appIDs = appIDs.filter( function ( item, pos ) {
                if ( item.match( "window:" ) ) return false
                return true
            }, this )

            if ( excludeFavorites ) {
                let favApps = global.settings.get_strv( "favorite-apps" )
                appIDs = appIDs.filter( ( item, pos ) => {
                    let ret = true
                    favApps.forEach( function ( favItem ) {
                        if ( item.match( favItem ) ) ret = false
                    }, this )
                    return ret
                }, this )
            }

            return appIDs
        } catch ( e ) { dev.log( e ) }
    }
    switchToWorkspace( index = 0 ) {
        try {
            index = parseInt( index, 10 )
            this._workspaceUpdate()
            Me.gWorkspaceManager.get_workspace_by_index( index ).activate( 0 )
            this._workspaceUpdate()
        } catch ( e ) { dev.log( e ) }

    }
    _moveWindowsToWorkspace() {
        //TO DO
    }
    activateIsolater( init = false ) {
        try {
            if ( !init )
                Me.session.activeSession.Options.IsolateWorkspaces = !Me.session.activeSession.Options.IsolateWorkspaces

            if ( Me.session.activeSession.Options.IsolateWorkspaces ) {
                // Defer to isolaters in other extensions
                if ( Me.gExtensions.dash2panel() && Me.gExtensions.dash2panelSettings() ) {
                    if ( Me.workspaceIsolater ) { Me.workspaceIsolater.destroy(); delete Me.workspaceIsolater }
                    Me.gExtensions.dash2panelSettings().set_boolean( "isolate-workspaces", true )
                } else if ( Me.gExtensions.dash2dock() && Me.gExtensions.dash2dockSettings() ) {
                    if ( Me.workspaceIsolater ) { Me.workspaceIsolater.destroy(); delete Me.workspaceIsolater }
                    Me.gExtensions.dash2dockSettings().set_boolean( "isolate-workspaces", true )
                } else {
                    Me.workspaceIsolater = new workspaceIsolater.WorkspaceIsolator()
                    workspaceIsolater.WorkspaceIsolator.refresh()
                }
            } else {
                // util.spawn(['dconf', 'write', '/org/gnome/shell/extensions/dash-to-panel/isolate-workspaces', 'false']);
                // util.spawn(['dconf', 'write', '/org/gnome/shell/extensions/dash-to-dock/isolate-workspaces', 'false']);
                if ( Me.gExtensions.dash2panelSettings() )
                    Me.gExtensions.dash2panelSettings().set_boolean( "isolate-workspaces", false )
                if ( Me.gExtensions.dash2dockSettings() )
                    Me.gExtensions.dash2dockSettings().set_boolean( "isolate-workspaces", false )
                if ( Me.workspaceIsolater ) {
                    Me.workspaceIsolater.destroy()
                    delete Me.workspaceIsolater
                }
            }
        } catch ( e ) { dev.log( e ) }

        Me.session.saveSession()
    }

    spawnOnSwitch( workset ) {
        const cmd = Me.session.activeSession.Options.CliSwitch.replaceAll( "$CWORKSPACE", workset.WorksetName )
        const args = [
            "/usr/bin/env",
            "bash",
            "-c",
            cmd
        ]
        utils.spawnWithCallback(
            null, args, GLib.get_environ(), 0, null,
            ( stdout ) => {
                try {
                    if ( !stdout ) return
                    dev.log( "Workspace switched command output:", stdout )
                } catch ( e ) { dev.log( e ) }
            }
        )
    }
}