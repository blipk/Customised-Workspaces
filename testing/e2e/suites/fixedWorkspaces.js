/*
 * Suite "fixed-workspaces": when GNOME uses a fixed number of workspaces, the extension also adds the
 * workspaces up to the last workspace with an active environment. Mutter then saves the new number of
 * workspaces in the GNOME settings: it does this for each added workspace in this mode. When the user makes
 * the number smaller, the environments of the removed workspaces close.
 */

// External imports
import Gio from "gi://Gio"

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

const FIXED_WORKSPACES = 4
const PLAY_WORKSPACE = 5
// With a fixed number of workspaces, GNOME adds no empty workspace at the end
const EXPECTED_WORKSPACES = PLAY_WORKSPACE + 1
// The Primary and Work workspaces, and the empty workspace after them
const FIXTURE_WORKSPACES = worksets.WORK.workspace + 2
const WORKSPACE_CHANGE_TIMEOUT_MS = 5000
const DYNAMIC_WORKSPACES_KEY = "dynamic-workspaces"
const NUM_WORKSPACES_KEY = "num-workspaces"

/** @returns {string} The number of workspaces, as the detail of a check */
const countDetail = () => `${shell.workspaceCount()} workspaces`

export default {
    name: "fixed-workspaces",

    async run( t ) {
        const mutterSettings = new Gio.Settings( { schema_id: "org.gnome.mutter" } )
        const wmSettings = new Gio.Settings( { schema_id: "org.gnome.desktop.wm.preferences" } )
        const numWorkspacesBefore = wmSettings.get_int( NUM_WORKSPACES_KEY )

        await shell.activateWorkspace( worksets.PRIMARY.workspace )
        wmSettings.set_int( NUM_WORKSPACES_KEY, FIXED_WORKSPACES )
        mutterSettings.set_boolean( DYNAMIC_WORKSPACES_KEY, false )

        try {
            const fixed = await shell.waitFor( () => shell.workspaceCount() === FIXED_WORKSPACES, WORKSPACE_CHANGE_TIMEOUT_MS )
            if ( !t.check( "GNOME uses the fixed number of workspaces", fixed, countDetail() ) ) return

            worksets.addEnvironment( worksets.PLAY, PLAY_WORKSPACE )
            worksets.workspaceManager()._workspaceUpdate()
            t.check( "the workspaces up to the Play workspace are created", shell.workspaceCount() === EXPECTED_WORKSPACES, countDetail() )
            t.check( "GNOME saves the new number of workspaces in its settings",
                wmSettings.get_int( NUM_WORKSPACES_KEY ) === EXPECTED_WORKSPACES, `${wmSettings.get_int( NUM_WORKSPACES_KEY )}` )

            t.check( "switch to the Play workspace completes", await shell.activateWorkspace( PLAY_WORKSPACE ) )
            t.check( "the Play environment is active on its workspace",
                worksets.worksetOnWorkspace( PLAY_WORKSPACE )?.WorksetName === worksets.PLAY.name,
                `${worksets.worksetOnWorkspace( PLAY_WORKSPACE )?.WorksetName}` )
            t.check( "desktop wallpaper setting is the Play wallpaper",
                worksets.desktopWallpaperUri().endsWith( `/${worksets.PLAY.wallpaper}.png` ), worksets.desktopWallpaperUri() )

            // A smaller fixed number removes the last workspaces. Mutter then emits no "workspace-removed".
            await shell.activateWorkspace( worksets.PRIMARY.workspace )
            wmSettings.set_int( NUM_WORKSPACES_KEY, FIXED_WORKSPACES )
            const removed = await shell.waitFor( () => shell.workspaceCount() === FIXED_WORKSPACES, WORKSPACE_CHANGE_TIMEOUT_MS )
            t.check( "a smaller fixed number removes the Play workspace", removed, countDetail() )
            worksets.workspaceManager()._workspaceUpdate()
            const playMaps = worksets.workspaceMapsWithCurrent( worksets.PLAY.name )
            t.check( "the environment of the removed Play workspace closes", playMaps.length === 0, playMaps.join( "," ) )
            t.check( "the extension does not add the removed workspace again",
                shell.workspaceCount() === FIXED_WORKSPACES && wmSettings.get_int( NUM_WORKSPACES_KEY ) === FIXED_WORKSPACES,
                `${countDetail()}, setting ${wmSettings.get_int( NUM_WORKSPACES_KEY )}` )
        } finally {
            await shell.activateWorkspace( worksets.PRIMARY.workspace )
            worksets.removeEnvironment( worksets.PLAY.name )
            worksets.workspaceManager()._workspaceUpdate()
            wmSettings.set_int( NUM_WORKSPACES_KEY, numWorkspacesBefore )
            mutterSettings.set_boolean( DYNAMIC_WORKSPACES_KEY, true )
        }

        const dynamicAgain = await shell.waitFor( () => shell.workspaceCount() === FIXTURE_WORKSPACES, WORKSPACE_CHANGE_TIMEOUT_MS )
        t.check( "dynamic workspaces again: GNOME removes the extra workspaces", dynamicAgain, countDetail() )
    },
}
