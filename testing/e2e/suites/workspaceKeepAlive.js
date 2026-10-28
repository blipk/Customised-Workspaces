/*
 * Suite "workspace-keep-alive": GNOME keeps a new workspace for a short time when an application is
 * dropped between the workspace thumbnails of the overview (Main.wm.keepWorkspaceAlive()). GNOME keeps
 * the ID of a GLib timer in the "_keepAliveId" property of the workspace, and removes the old timer when
 * it starts a new one. The extension must not write to this property outside the GNOME workspace check:
 * GJS gives a boolean value to GLib.source_remove() as source ID 1, which belongs to another part of GNOME Shell.
 */

// External imports
import GLib from "gi://GLib"

import * as Main from "resource:///org/gnome/shell/ui/main.js"

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

// How long GNOME keeps the workspaces alive in this suite
const KEEP_ALIVE_MS = 300
const KEEP_ALIVE_END_TIMEOUT_MS = 3000
// The Primary and Work workspaces, and the empty workspace after them
const FIXTURE_WORKSPACES = worksets.WORK.workspace + 2

/**
 * Records the values that GLib.source_remove() gets while an action runs. GNOME Shell modules get the
 * same GLib namespace object, thus they also use the recorder. Only number values go to GLib, so that
 * the test does not remove a GLib source of another part of GNOME Shell.
 * @param {function(): void} action - The action
 * @returns {Array<number|boolean>} The values, in order
 */
const recordSourceRemovals = ( action ) => {
    const originalSourceRemove = GLib.source_remove
    const values = []
    GLib.source_remove = ( id ) => {
        values.push( id )
        return typeof id === "number" ? originalSourceRemove( id ) : false
    }
    try {
        action()
    } finally {
        GLib.source_remove = originalSourceRemove
    }
    return values
}

export default {
    name: "workspace-keep-alive",

    async run( t ) {
        await shell.activateWorkspace( worksets.PRIMARY.workspace )
        const manager = worksets.workspaceManager()
        manager._workspaceUpdate()
        t.check( "the extension does not write booleans to the GNOME keep-alive property",
            shell.allWorkspaces().every( ( workspace ) => typeof workspace._keepAliveId !== "boolean" ),
            shell.allWorkspaces().map( ( workspace ) => `${workspace._keepAliveId}` ).join( "," ) )

        // The extension keeps the Work workspace
        const workWorkspace = shell.workspaceAt( worksets.WORK.workspace )
        const removed = recordSourceRemovals( () => Main.wm.keepWorkspaceAlive( workWorkspace, KEEP_ALIVE_MS ) )
        t.check( "GNOME removes no GLib source when it keeps an environment workspace alive", removed.length === 0, removed.join( "," ) )

        // The extension does not keep the empty workspace at the end
        const lastWorkspace = shell.workspaceAt( shell.workspaceCount() - 1 )
        Main.wm.keepWorkspaceAlive( lastWorkspace, KEEP_ALIVE_MS )
        const timerId = lastWorkspace._keepAliveId
        manager._workspaceUpdate()
        t.check( "the extension does not change the GNOME keep-alive timer of a workspace",
            typeof timerId === "number" && timerId > 0 && lastWorkspace._keepAliveId === timerId, `${timerId} -> ${lastWorkspace._keepAliveId}` )

        const timersStopped = await shell.waitFor( () => !workWorkspace._keepAliveId && !lastWorkspace._keepAliveId, KEEP_ALIVE_END_TIMEOUT_MS )
        t.check( "the GNOME keep-alive timers stop", timersStopped,
            `${workWorkspace._keepAliveId}, ${lastWorkspace._keepAliveId}` )
        Main.wm._workspaceTracker._checkWorkspaces()
        t.check( "after the GNOME timer stops, the extension keeps the Work workspace",
            shell.workspaceAt( worksets.WORK.workspace ) === workWorkspace && shell.workspaceCount() === FIXTURE_WORKSPACES,
            `${shell.workspaceCount()} workspaces` )
    },
}
