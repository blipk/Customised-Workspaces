/*
 * Suite "screen-lock": GNOME disables the extension at the lock screen and enables it again after unlock. The
 * extension then gives its workspaces back to GNOME, which removes the empty ones. The environments of the
 * removed workspaces go after the remaining workspaces, so that the other environments stay with their windows.
 * The default environments stay at their positions.
 */

// External imports
import * as Main from "resource:///org/gnome/shell/ui/main.js"

// Internal imports
import * as shell from "../lib/shell.js"
import * as windows from "../lib/windows.js"
import * as worksets from "../lib/worksets.js"

const WINDOW_TITLE = "screen-lock"
const PLAY_WORKSPACE = 2
// The Work workspace has no windows, thus GNOME removes it at the lock screen and the Play workspace moves down
const PLAY_WORKSPACE_LOCKED = PLAY_WORKSPACE - 1
// Primary, the Play workspace with the window, and the empty workspace at the end
const LOCKED_WORKSPACES = 3
// Primary, Play, Work, and the empty workspace at the end
const UNLOCKED_WORKSPACES = 4
const LOCK_TIMEOUT_MS = 10000
const UNLOCK_SETTLE_MS = 1500

/**
 * @param {string} wallpaper - Name of a fixture wallpaper
 * @returns {boolean} True if the desktop wallpaper setting is this wallpaper
 */
const showsWallpaper = ( wallpaper ) => worksets.desktopWallpaperUri().endsWith( `/${wallpaper}.png` )

export default {
    name: "screen-lock",

    async run( t ) {
        if ( !Main.screenShield ) {
            t.skip( "lock and unlock", "GNOME Shell has no screen shield in this session" )
            return
        }

        await shell.activateWorkspace( worksets.PRIMARY.workspace )
        worksets.addEnvironment( worksets.PLAY, PLAY_WORKSPACE )
        worksets.workspaceManager()._workspaceUpdate()
        const { window, close } = await windows.openTestWindow( WINDOW_TITLE )

        try {
            if ( !t.check( "the test window opens", window !== undefined, `see test-window-${WINDOW_TITLE}.log` ) ) return
            window.change_workspace_by_index( PLAY_WORKSPACE, false )

            Main.screenShield.lock( false )
            const locked = await shell.waitFor( worksets.isInactive, LOCK_TIMEOUT_MS )
            if ( !t.check( "lock: GNOME disables the extension", locked, Main.sessionMode.currentMode ) ) return
            t.check( "lock: GNOME removes the empty Work workspace",
                shell.workspaceCount() === LOCKED_WORKSPACES && window.get_workspace().index() === PLAY_WORKSPACE_LOCKED,
                `${shell.workspaceCount()} workspaces, window on ${window.get_workspace().index()}` )
            const savedMaps = worksets.readSessionFile().workspaceMaps
            const savedCurrents = worksets.workspaceMapsText( savedMaps, LOCKED_WORKSPACES )
            t.check( "lock: the Play environment stays with its window, and the Work environment goes after it",
                savedCurrents === "Primary,Play,Work", savedCurrents )
            const savedDefaults = worksets.workspaceMapsText( savedMaps, PLAY_WORKSPACE, "defaultWorkset" )
            t.check( "lock: the default environments stay at their positions", savedDefaults === "Primary,Work", savedDefaults )
            await t.screenshot( "locked" )

            Main.screenShield.deactivate( false )
            const unlocked = await shell.waitFor( worksets.isActive, LOCK_TIMEOUT_MS )
            if ( !t.check( "unlock: GNOME enables the extension again", unlocked, Main.sessionMode.currentMode ) ) return
            await shell.sleep( UNLOCK_SETTLE_MS )
            t.check( "unlock: the active workspace does not change",
                shell.activeWorkspaceIndex() === worksets.PRIMARY.workspace, `${shell.activeWorkspaceIndex()}` )
            t.check( "unlock: the workspaces of all environments are created", shell.workspaceCount() === UNLOCKED_WORKSPACES,
                `${shell.workspaceCount()} workspaces` )

            t.check( "switch to the Play workspace completes", await shell.activateWorkspace( PLAY_WORKSPACE_LOCKED ) )
            t.check( "the Play workspace has the test window", window.get_workspace().index() === PLAY_WORKSPACE_LOCKED )
            t.check( "the Play workspace shows the Play wallpaper", showsWallpaper( worksets.PLAY.wallpaper ), worksets.desktopWallpaperUri() )
            t.check( "switch to the Work workspace completes", await shell.activateWorkspace( PLAY_WORKSPACE ) )
            t.check( "the Work workspace shows the Work wallpaper", showsWallpaper( worksets.WORK.wallpaper ), worksets.desktopWallpaperUri() )
            await t.screenshot( "unlocked-work" )
        } finally {
            if ( Main.sessionMode.currentMode === "unlock-dialog" ) Main.screenShield.deactivate( false )
            if ( !worksets.isActive() ) await shell.waitFor( worksets.isActive, LOCK_TIMEOUT_MS )
            t.check( "the test window closes", await close() )
            if ( worksets.isActive() ) {
                await shell.activateWorkspace( worksets.PRIMARY.workspace )
                worksets.removeEnvironment( worksets.PLAY.name )
                worksets.resetCurrentWorksets()
            }
        }
    },
}
