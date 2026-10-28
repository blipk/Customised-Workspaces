/*
 * Suite "workspace-creation" (PR #77): the extension creates the workspaces up to the last workspace
 * with an active environment, also at start-up, and GNOME does not remove them. The suite disables and
 * enables the extension, as GNOME does at log out and log in. The Play environment is on the last
 * workspace of the fixture maps, thus the empty workspace after it has no map in the session.
 */

// External imports
import * as Main from "resource:///org/gnome/shell/ui/main.js"

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

const PLAY_WORKSPACE = 7
// The extension keeps the workspaces up to the Play workspace, and GNOME adds one empty workspace after them
const EXPECTED_WORKSPACES = PLAY_WORKSPACE + 2
const UNMAPPED_WORKSPACE = PLAY_WORKSPACE + 1
// At disable, the environment of a removed workspace goes after the last remaining workspace that is in use
const RELEASED_POSITION = worksets.WORK.workspace + 1
// The Primary and Work workspaces, and the empty workspace after them
const FIXTURE_WORKSPACES = worksets.WORK.workspace + 2
const WORKSPACE_CHANGE_TIMEOUT_MS = 5000
const ENABLE_SETTLE_MS = 1500

/** @returns {string} The number of workspaces, as the detail of a check */
const countDetail = () => `${shell.workspaceCount()} workspaces`

/** @returns {boolean} True if a workspace has a keep-alive flag of the extension */
const hasKeepAliveFlag = () => shell.allWorkspaces().some( ( workspace ) => workspace._keepAliveId === true || workspace._worksetKeepAlive )

export default {
    name: "workspace-creation",

    async run( t ) {
        await shell.activateWorkspace( worksets.WORK.workspace )
        worksets.addEnvironment( worksets.PLAY, PLAY_WORKSPACE )

        try {
            worksets.workspaceManager()._workspaceUpdate()
            t.check( "new environment on a missing workspace: the workspaces up to it are created",
                shell.workspaceCount() === EXPECTED_WORKSPACES, countDetail() )

            // As at log out
            if ( !t.check( "the extension is disabled", await worksets.disable() ) ) return
            t.check( "disable: the active workspace does not change",
                shell.activeWorkspaceIndex() === worksets.WORK.workspace, `${shell.activeWorkspaceIndex()}` )
            t.check( "disable: no workspace has a keep-alive flag of the extension", !hasKeepAliveFlag() )
            const released = await shell.waitFor( () => shell.workspaceCount() <= PLAY_WORKSPACE, WORKSPACE_CHANGE_TIMEOUT_MS )
            if ( !t.check( "disable: GNOME removes the empty workspaces", released, countDetail() ) ) return
            const savedCurrents = worksets.workspaceMapsText( worksets.readSessionFile().workspaceMaps, PLAY_WORKSPACE + 1 )
            t.check( "disable: the environment of the removed Play workspace goes after the remaining workspaces",
                savedCurrents === "Primary,Work,Play,-,-,-,-,-", savedCurrents )

            // As at log in, with a session that was saved while the workspaces before the Play workspace had windows
            worksets.editSessionFile( ( sessionObject ) => {
                sessionObject.workspaceMaps[`Workspace${RELEASED_POSITION}`].currentWorkset = ""
                sessionObject.workspaceMaps[`Workspace${PLAY_WORKSPACE}`].currentWorkset = worksets.PLAY.name
            } )
            if ( !t.check( "the extension is enabled again", await worksets.enable() ) ) return
            await shell.sleep( ENABLE_SETTLE_MS )
            t.check( "enable: the workspaces up to the Play workspace are created",
                shell.workspaceCount() === EXPECTED_WORKSPACES, `${countDetail()}, expected ${EXPECTED_WORKSPACES}` )
            t.check( "enable: the active workspace does not change",
                shell.activeWorkspaceIndex() === worksets.WORK.workspace, `${shell.activeWorkspaceIndex()}` )

            // GNOME removes empty workspaces when it checks the workspaces, for example after a window closes
            Main.wm._workspaceTracker._checkWorkspaces()
            t.check( "a GNOME workspace check keeps the workspaces of the extension",
                shell.workspaceCount() === EXPECTED_WORKSPACES, countDetail() )

            t.check( "switch to the Play workspace completes", await shell.activateWorkspace( PLAY_WORKSPACE ) )
            t.check( "the Play environment is active on its workspace",
                worksets.worksetOnWorkspace( PLAY_WORKSPACE )?.WorksetName === worksets.PLAY.name,
                `${worksets.worksetOnWorkspace( PLAY_WORKSPACE )?.WorksetName}` )
            t.check( "desktop wallpaper setting is the Play wallpaper",
                worksets.desktopWallpaperUri().endsWith( `/${worksets.PLAY.wallpaper}.png` ), worksets.desktopWallpaperUri() )
            t.check( "the workspaces stay after the switch", shell.workspaceCount() === EXPECTED_WORKSPACES, countDetail() )
            await t.screenshot( "play-desktop" )

            // The session has no map for this workspace
            t.check( "switch to the workspace after the Play workspace completes", await shell.activateWorkspace( UNMAPPED_WORKSPACE ) )
            t.check( "the workspace without a map gets a map in the session",
                worksets.session().workspaceMaps[`Workspace${UNMAPPED_WORKSPACE}`] !== undefined )
            t.check( "the workspace without a map shows the Primary (default) wallpaper",
                worksets.desktopWallpaperUri().endsWith( `/${worksets.PRIMARY.wallpaper}.png` ), worksets.desktopWallpaperUri() )
            t.check( "the workspace without a map shows the Primary (default) favourites",
                worksets.dashFavourites().join( "," ) === worksets.PRIMARY.favourites.join( "," ), worksets.dashFavourites().join( "," ) )

            // An environment can be the current environment of one workspace only
            const unmappedMap = worksets.session().workspaceMaps[`Workspace${UNMAPPED_WORKSPACE}`]
            if ( unmappedMap ) {
                unmappedMap.currentWorkset = worksets.PLAY.name
                worksets.workspaceManager()._workspaceUpdate()
                const playMaps = worksets.workspaceMapsWithCurrent( worksets.PLAY.name )
                t.check( "an environment that is current on two workspaces stays only on the first",
                    playMaps.join( "," ) === `Workspace${PLAY_WORKSPACE}`, playMaps.join( "," ) )
            }

            await shell.activateWorkspace( worksets.PRIMARY.workspace )
            worksets.session().closeWorkset( worksets.worksetOnWorkspace( PLAY_WORKSPACE ) )
            const closed = await shell.waitFor( () => shell.workspaceCount() === FIXTURE_WORKSPACES, WORKSPACE_CHANGE_TIMEOUT_MS )
            t.check( "close the Play environment: GNOME removes its empty workspaces", closed, countDetail() )
        } finally {
            if ( worksets.isInactive() ) await worksets.enable()
            if ( worksets.isActive() ) {
                await shell.activateWorkspace( worksets.PRIMARY.workspace )
                delete worksets.session().workspaceMaps[`Workspace${UNMAPPED_WORKSPACE}`]
                worksets.removeEnvironment( worksets.PLAY.name )
                worksets.workspaceManager()._workspaceUpdate()
            }
        }
    },
}
