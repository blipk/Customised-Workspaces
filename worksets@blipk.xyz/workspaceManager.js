/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) http://github.com/blipk
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
import Gio from "gi://Gio"
import GLib from "gi://GLib"
// import Meta from "gi://Meta"
import Shell from "gi://Shell"

import * as Main from "resource:///org/gnome/shell/ui/main.js"
// import * as workspace from "resource:///org/gnome/shell/ui/workspace.js"

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

            // GNOME does not remove a workspace that has a "_keepAliveId" (WorkspaceTracker in js/ui/windowManager.js).
            // GNOME also keeps the ID of its own GLib timer there, and gives that value to GLib.source_remove().
            // Thus the extension marks its workspaces with "_worksetKeepAlive", and sets "_keepAliveId" only while GNOME checks them.
            this.injectionHandler = new utils.InjectionHandler()
            this.injectionHandler.add(
                Object.getPrototypeOf( Main.wm._workspaceTracker ), "_checkWorkspaces",
                ( originalMethod ) =>
                    function checkWorkspaces() {
                        const keptWorkspaces = this._workspaces.filter( ( workspace ) => workspace._worksetKeepAlive && !workspace._keepAliveId )
                        keptWorkspaces.forEach( ( workspace ) => { workspace._keepAliveId = true } )
                        try {
                            return originalMethod.call( this )
                        } finally {
                            keptWorkspaces.forEach( ( workspace ) => { workspace._keepAliveId = 0 } )
                        }
                    }
            )

            // The environments follow their workspaces when Mutter or GNOME adds, removes or reorders workspaces
            this._mappedWorkspaces = this._allWorkspaces()
            this._releasedWorksets = null
            for ( const signal of ["workspace-added", "workspace-removed", "workspaces-reordered", "notify::n-workspaces"] )
                this.signals.add( Me.gWorkspaceManager, signal, () => this._followWorkspaces() )

            // GNOME inserts a workspace when a window or an application is dropped between the overview thumbnails, and when
            // a window moves to a workspace before the first one. It adds the new workspace at the end, and moves the windows
            // from the insert position one workspace up. The workspace objects do not move, thus the environments must move here.
            const workspaceManager = this
            this.injectionHandler.add(
                Object.getPrototypeOf( Main.wm ), "insertWorkspace",
                ( originalMethod ) =>
                    function insertWorkspace( pos ) {
                        const countBefore = Me.gWorkspaceManager.n_workspaces
                        workspaceManager._insertingWorkspace = true
                        workspaceManager._switchedWhileInserting = false
                        try {
                            originalMethod.call( this, pos )
                        } finally {
                            workspaceManager._insertingWorkspace = false
                            if ( Me.gWorkspaceManager.n_workspaces > countBefore ) workspaceManager._workspaceInserted( pos )
                            if ( workspaceManager._switchedWhileInserting ) workspaceManager._activeWorkspaceChanged()
                        }
                    }
            )

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
            this._releaseWorkspaces()
        } catch ( e ) { dev.log( e ) }
        this.injectionHandler?.destroy()
        this.signals?.destroy()
    }
    /**
     * Gives all workspaces back to GNOME, which then removes the empty ones (GNOME keeps the active workspace).
     * GNOME disables the extension at the lock screen, thus the environments of the removed workspaces go after the
     * last remaining workspace with windows or an environment. Then, when the extension is enabled again, the
     * environments are still on the workspaces with their windows.
     */
    _releaseWorkspaces() {
        // _workspaceUpdate() would keep the workspaces again
        this.noUpdate = true
        this._releasedWorksets = []
        try {
            for ( const workspace of this._allWorkspaces() ) delete workspace._worksetKeepAlive
            // The removals call _followWorkspaces(), which records the environments of the removed workspaces
            Main.wm._workspaceTracker._checkWorkspaces()
            this._followWorkspaces()

            const released = this._releasedWorksets.sort( ( a, b ) => a.index - b.index ).map( ( { name } ) => name )
            if ( released.length === 0 ) return
            const workspaces = this._allWorkspaces()
            Me.session.moveCurrentWorksets( ( currents ) => {
                const lastUsed = workspaces.findLastIndex( ( workspace, i ) =>
                    currents[i] || workspace.list_windows().some( ( window ) => !window.is_on_all_workspaces() ) )
                // A used workspace can have no map yet, thus make the list long enough before the insert
                const padded = Array.from( { length: Math.max( currents.length, lastUsed + 1 ) }, ( _, i ) => currents[i] ?? "" )
                return padded.toSpliced( lastUsed + 1, 0, ...released )
            } )
        } finally {
            this._releasedWorksets = null
        }
    }
    /**
     * Moves the current environments of the workspace maps with their workspaces when Mutter or GNOME adds, removes or
     * reorders workspaces. Mutter does not always emit "workspace-removed" (for example when a fixed number of workspaces
     * gets smaller), thus this compares the workspace objects with the ones of the last call.
     * - A workspace keeps its environment when it moves to another position.
     * - A new workspace at the end gets the environment of its position. A workspace inserted before others gets none.
     * - The environment of a removed workspace closes. While _releaseWorkspaces() runs, it is recorded instead.
     * - The environments of positions after the last workspace move with the workspaces before them.
     */
    _followWorkspaces() {
        try {
            const before = this._mappedWorkspaces
            const after = this._allWorkspaces()
            if ( before.length === after.length && before.every( ( workspace, i ) => workspace === after[i] ) ) return
            this._mappedWorkspaces = after

            Me.session.moveCurrentWorksets( ( currents ) => {
                const pending = currents.slice( before.length )
                const lastKnown = after.findLastIndex( ( workspace ) => before.includes( workspace ) )
                const moved = after.map( ( workspace, i ) => {
                    const index = before.indexOf( workspace )
                    if ( index > -1 ) return currents[index] ?? ""
                    return i > lastKnown ? pending.shift() ?? "" : ""
                } )
                before.forEach( ( workspace, i ) => {
                    if ( !after.includes( workspace ) && currents[i] ) this._releasedWorksets?.push( { index: i, name: currents[i] } )
                } )
                return [...moved, ...pending]
            } )
            this._queueOverviewRefresh()
        } catch ( e ) { dev.log( e ) }
    }
    /** Refreshes the overview when GNOME Shell is idle, thus after GNOME updated its views for a workspace change. */
    _queueOverviewRefresh() {
        if ( this._overviewRefreshId ) return
        this._overviewRefreshId = this.signals.add( GLib.idle_add( GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._overviewRefreshId = 0
            Me.workspaceViewManager?.refreshOverview()
            return GLib.SOURCE_REMOVE
        } ) )
    }
    /** @returns {Array<Meta.Workspace>} All workspaces, in index order */
    _allWorkspaces() {
        return Array.from( { length: Me.gWorkspaceManager.n_workspaces }, ( _, i ) => Me.gWorkspaceManager.get_workspace_by_index( i ) )
    }
    /**
     * Moves the current environments from the position of an inserted workspace one position up, as GNOME did with the
     * windows (see the insertWorkspace() override), and keeps the workspaces at their new positions.
     * @param {number} position - Position of the inserted workspace
     */
    _workspaceInserted( position ) {
        try {
            Me.session.moveCurrentWorksets( ( currents ) => currents.toSpliced( position, 0, "" ) )
            this._workspaceUpdate()
            this._queueOverviewRefresh()
        } catch ( e ) { dev.log( e ) }
    }
    _workspaceUpdate() {
        if ( this.noUpdate ) return
        try {
            let min_workspaces = 1

            let currents = []
            utils.forEachEntry( Me.session.workspaceMaps, ( workspaceMapKey, workspaceMapValues, i ) => {
                // Remove any worksets that are set to current on more than one workspace
                if ( workspaceMapValues.currentWorkset != "" ) {
                    if ( currents.indexOf( workspaceMapValues.currentWorkset ) > -1 ) {
                        Me.session.workspaceMaps[workspaceMapKey].currentWorkset = ""
                    }

                    currents.push( workspaceMapValues.currentWorkset )
                }

                // Minimum workspaces should be one more than the workspace index that the last active workset is on
                let index = parseInt( workspaceMapKey.replace( "Workspace", "" ) )
                if ( workspaceMapValues.currentWorkset != "" && index > min_workspaces - 2 ) {
                    min_workspaces = index + 2
                }
            }, this )

            if ( min_workspaces < 2 ) min_workspaces = 2


            const currentWorkspaces = []
            const n_global_workspaces = Me.gWorkspaceManager.n_workspaces

            // Make all workspaces non-persistent
            for ( let i = n_global_workspaces - 1; i >= 0; i-- ) {
                currentWorkspaces[i] = Me.gWorkspaceManager.get_workspace_by_index( i )
                currentWorkspaces[i]._worksetKeepAlive = false
            }


            for ( let i = 0; i < min_workspaces - 1; i++ ) {
                // If we have less than the minimum workspaces create new ones
                if ( !currentWorkspaces[i] )
                    currentWorkspaces[i] = Me.gWorkspaceManager.append_new_workspace( false, global.get_current_time() )

                // Make all workspaces persistent again
                currentWorkspaces[i]._worksetKeepAlive = true
            }


            // Update the workspace view
            Main.wm._workspaceTracker._checkWorkspaces()
        } catch ( e ) { dev.log( e ) }
    }
    _activeWorkspaceChanged() {
        // GNOME can switch workspaces while it inserts one. Wait until the environments moved (see _workspaceInserted()).
        if ( this._insertingWorkspace ) {
            this._switchedWhileInserting = true
            return
        }
        try {
            this._workspaceUpdate()
            let foundActive = false
            //Loop through worksets and load the one which is set to current
            Me.session.Worksets.forEach( function f ( workset, worksetIndex ) {
                if ( Me.session.workspaceMap( this.activeWorkspaceIndex ).currentWorkset == workset.WorksetName ) {
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
            Me.session.Worksets.forEach( function f ( workset, worksetIndex ) {
                let map = Me.session.workspaceMap( this.activeWorkspaceIndex )
                // A default environment that is open on another workspace stays there (see displayWorkset())
                if ( map.currentWorkset == workset.WorksetName ||
                    ( map.currentWorkset == "" && map.defaultWorkset == workset.WorksetName
                      && !Me.session.ActiveWorksets.includes( workset.WorksetName ) ) ) {
                    Me.session.displayWorkset( Me.session.Worksets[worksetIndex] )
                    Me.session.workspaceMap( this.activeWorkspaceIndex ).currentWorkset = workset.WorksetName
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
                .filter( ( w ) => !w.is_skip_taskbar() && !w.is_on_all_workspaces() )
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
        return null
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

    _readProcEnviron( pid ) {
        try {
            let envFile = Gio.file_new_for_path( "/proc/" + pid + "/environ" )
            let [success, contents] = envFile.load_contents( null )
            if ( !success ) return ""
            // /proc/[pid]/environ uses null bytes as separators
            return new TextDecoder().decode( contents ).replace( /\0/g, "\n" ).toLowerCase()
        } catch ( e ) {
            return ""
        }
    }
    _bamfHintCache = {}
    _getBamfHint( pid ) {
        if ( this._bamfHintCache[pid] ) return this._bamfHintCache[pid]
        let env = this._readProcEnviron( pid )
        let bamfIdx = env.indexOf( "bamf_desktop_file_hint=" )
        if ( bamfIdx === -1 ) return ""
        let hintValue = env.substring( bamfIdx + 23 )
        let endIdx = hintValue.indexOf( "\n" )
        if ( endIdx > -1 ) hintValue = hintValue.substring( 0, endIdx )
        let result = GLib.path_get_basename( hintValue )
        this._bamfHintCache[pid] = result
        return result
    }
    getWorkspaceAppIds( workspaceIndex, excludeFavorites = true ) {
        try {
            if ( utils.isEmpty( workspaceIndex ) ) workspaceIndex = Me.gWorkspaceManager.get_active_workspace_index()

            const windowTracker = Shell.WindowTracker.get_default()
            const windows = this.getWorkspaceWindows( workspaceIndex )
            let appIDs = []

            windows.forEach( function f ( w ) {
                let id = windowTracker.get_window_app( w ).get_id()

                // Snap installed applications are launched as window backed,
                // so need to get the hint that is set for ubuntus BAMF daemon from the apps environment vars
                // Possible alternative if the BAMF method proves unreliable: Shell.AppSystem.search(w.get_wm_class_instance())
                if ( id.indexOf( "window:" ) > -1 ) {
                    let bamfId = this._getBamfHint( w.get_pid() )
                    if ( bamfId ) id = bamfId
                }

                appIDs.push( id )
            }, this )

            //remove duplicates from apps with multiple windows
            appIDs = appIDs.filter( ( item, pos ) => {
                return appIDs.indexOf( item ) === pos
            }, this )

            //remove un-apped windows
            appIDs = appIDs.filter( ( item, pos ) => {
                if ( item.match( "window:" ) ) return false
                return true
            }, this )

            if ( excludeFavorites ) {
                let favApps = global.settings.get_strv( "favorite-apps" )
                appIDs = appIDs.filter( ( item, pos ) => {
                    let ret = true
                    favApps.forEach( function f ( favItem ) {
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
                const hasDash2Panel = Boolean( Me.gExtensions.dash2panel() ) && Boolean( Me.gExtensions.dash2panelSettings() )
                const enabledDash2Panel = hasDash2Panel && Me.gExtensions.dash2panelActive()

                const hasDash2Dock = Boolean( Me.gExtensions.dash2dock() ) && Boolean( Me.gExtensions.dash2dockSettings() )
                const enabledDash2Dock = hasDash2Dock && Me.gExtensions.dash2dockActive()

                // dev.log(
                //     `hasDash2Panel ${hasDash2Panel}`,
                //     `enabledDash2Panel ${enabledDash2Panel}`,
                //     `hasDash2Dock ${hasDash2Dock}`,
                //     `enabledDash2Dock ${enabledDash2Dock}`
                // )

                if ( ( hasDash2Panel || hasDash2Dock ) && Me.workspaceIsolater ) {
                    Me.workspaceIsolater.destroy()
                    delete Me.workspaceIsolater
                }

                if ( hasDash2Panel )
                    Me.gExtensions.dash2panelSettings().set_boolean( "isolate-workspaces", true )

                if ( hasDash2Dock )
                    Me.gExtensions.dash2dockSettings().set_boolean( "isolate-workspaces", true )

                if ( !enabledDash2Panel && !enabledDash2Dock ) {
                    Me.workspaceIsolater = new workspaceIsolater.WorkspaceIsolator()
                    workspaceIsolater.WorkspaceIsolator.refresh()
                }
            } else {
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

        Me.session.applySession()
    }

    spawnOnSwitch( workset ) {
        const cmd = Me.session.activeSession.Options.CliSwitch.replaceAll( "$CWORKSPACE", GLib.shell_quote( workset.WorksetName ) )
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