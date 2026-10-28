/* global global */

/*
 * Suite "workspace-order": the current environments follow their workspaces when GNOME or Mutter inserts,
 * reorders or removes workspaces, and the default environments stay at their positions.
 * - GNOME inserts a workspace (Main.wm.insertWorkspace()) when a window moves before the first workspace
 *   (keyboard), and when a window is dropped between two overview thumbnails (pointer). It adds the new
 *   workspace at the end and moves the windows, thus only the extension can move the environments.
 * - Mutter reorders workspaces (reorder_workspace()) and removes a workspace in the middle (remove_workspace())
 *   when other code asks for it. GNOME 51 itself does not do this.
 */

// External imports
import Clutter from "gi://Clutter"

import * as Main from "resource:///org/gnome/shell/ui/main.js"
import { WindowPreview } from "resource:///org/gnome/shell/ui/windowPreview.js"

// Internal imports
import * as shell from "../lib/shell.js"
import * as windows from "../lib/windows.js"
import * as worksets from "../lib/worksets.js"

const WINDOW_TITLE = "workspace-order"
// The Primary and Work workspaces, and the empty workspace after them
const FIXTURE_WORKSPACES = worksets.WORK.workspace + 2
// One more workspace after an insert
const INSERTED_WORKSPACES = FIXTURE_WORKSPACES + 1
// The drop position between the first two overview thumbnails
const DROP_POSITION = 1
const PLAY_WORKSPACE = 2
const WORKSPACE_CHANGE_TIMEOUT_MS = 5000

/**
 * @param {number} count - Number of workspace positions
 * @param {string} [field="currentWorkset"] - "currentWorkset" or "defaultWorkset"
 * @returns {string} The environments of the first workspace positions in the extension session
 */
const mapsText = ( count, field ) => worksets.workspaceMapsText( worksets.session().workspaceMaps, count, field )

/** @returns {string} The default environments of the fixture positions */
const defaultsText = () => mapsText( FIXTURE_WORKSPACES - 1, "defaultWorkset" )

/**
 * @param {string} wallpaper - Name of a fixture wallpaper
 * @returns {boolean} True if the desktop wallpaper setting is this wallpaper
 */
const showsWallpaper = ( wallpaper ) => worksets.desktopWallpaperUri().endsWith( `/${wallpaper}.png` )

/**
 * Puts the fixture environments back, with the test window on the Primary workspace.
 * @param {Meta.Window} window - The test window
 * @returns {Promise<boolean>} True if GNOME has the fixture workspaces again
 */
const reset = async ( window ) => {
    if ( Main.overview.visible ) await shell.hideOverview()
    window.change_workspace_by_index( worksets.PRIMARY.workspace, false )
    await shell.activateWorkspace( worksets.PRIMARY.workspace )
    worksets.resetCurrentWorksets()
    return shell.waitFor( () => shell.workspaceCount() === FIXTURE_WORKSPACES, WORKSPACE_CHANGE_TIMEOUT_MS )
}

/**
 * Keyboard: "Move window one workspace to the left" (Super+Shift+Page_Up) on the first workspace.
 * @param {object} t - The reporter
 * @param {Meta.Window} window - The test window, on the Primary workspace
 */
const keyboardInsert = async ( t, window ) => {
    Main.activateWindow( window )
    await shell.pressKeyCombination( Clutter.KEY_Super_L, Clutter.KEY_Shift_L, Clutter.KEY_Page_Up )
    const inserted = await shell.waitFor( () => shell.workspaceCount() === INSERTED_WORKSPACES && window.get_workspace().index() === 0,
        WORKSPACE_CHANGE_TIMEOUT_MS )
    t.check( "keyboard: GNOME adds a workspace before the first one for the window", inserted,
        `${shell.workspaceCount()} workspaces, window on ${window.get_workspace().index()}` )
    t.check( "keyboard: the environments move one workspace up", mapsText( INSERTED_WORKSPACES ) === "-,Primary,Work,-",
        mapsText( INSERTED_WORKSPACES ) )
    t.check( "keyboard: the default environments stay at their positions", defaultsText() === "Primary,Work", defaultsText() )
    t.check( "keyboard: the new first workspace does not take its default environment from the next workspace",
        worksets.workspaceMapsWithCurrent( worksets.PRIMARY.name ).join( "," ) === "Workspace1",
        worksets.workspaceMapsWithCurrent( worksets.PRIMARY.name ).join( "," ) )

    Main.wm._workspaceTracker._checkWorkspaces()
    t.check( "keyboard: GNOME keeps the moved environment workspaces", shell.workspaceCount() === INSERTED_WORKSPACES,
        `${shell.workspaceCount()} workspaces` )
    t.check( "switch to the moved Work workspace completes", await shell.activateWorkspace( worksets.WORK.workspace + 1 ) )
    t.check( "the moved Work workspace shows the Work wallpaper", showsWallpaper( worksets.WORK.wallpaper ), worksets.desktopWallpaperUri() )
    await t.screenshot( "keyboard-insert" )
}

/**
 * Pointer: drags the window from the overview to the drop position between the first two thumbnails.
 * @param {object} t - The reporter
 * @param {Meta.Window} window - The test window, on the Primary workspace
 */
const overviewDropInsert = async ( t, window ) => {
    if ( !t.check( "overview opens", await shell.showOverview() ) ) return
    const preview = shell.findActor( Main.layoutManager.overviewGroup,
        ( actor ) => actor instanceof WindowPreview && actor.metaWindow === window )
    const thumbnailsBox = worksets.views().thumbnailsBox
    const thumbnail = thumbnailsBox?._thumbnails[DROP_POSITION]
    if ( !t.check( "the overview shows the window preview and the thumbnails", preview?.mapped && thumbnail?.mapped ) ) return

    // GNOME shows the drop position in the spacing before the thumbnail
    const [thumbnailX, thumbnailY] = thumbnail.get_transformed_position()
    const [, thumbnailHeight] = thumbnail.get_transformed_size()
    const spacing = thumbnailsBox.get_theme_node().get_length( "spacing" )
    await shell.drag( shell.actorCenter( preview ), { x: thumbnailX - spacing / 2, y: thumbnailY + thumbnailHeight / 2 } )

    const inserted = await shell.waitFor( () => shell.workspaceCount() === INSERTED_WORKSPACES && window.get_workspace().index() === DROP_POSITION,
        WORKSPACE_CHANGE_TIMEOUT_MS )
    t.check( "overview drop: GNOME adds a workspace between the first two thumbnails for the window", inserted,
        `${shell.workspaceCount()} workspaces, window on ${window.get_workspace().index()}` )
    t.check( "overview drop: the environments after the drop position move one workspace up",
        mapsText( INSERTED_WORKSPACES ) === "Primary,-,Work,-", mapsText( INSERTED_WORKSPACES ) )
    t.check( "overview drop: the default environments stay at their positions", defaultsText() === "Primary,Work", defaultsText() )
    await t.screenshot( "overview-drop" )
}

/**
 * Mutter: moves the Work workspace before the Primary workspace.
 * @param {object} t - The reporter
 */
const mutterReorder = async ( t ) => {
    global.workspace_manager.reorder_workspace( shell.workspaceAt( worksets.WORK.workspace ), 0 )
    t.check( "Mutter reorder: the environments move with their workspaces", mapsText( FIXTURE_WORKSPACES ) === "Work,Primary,-",
        mapsText( FIXTURE_WORKSPACES ) )
    t.check( "Mutter reorder: the default environments stay at their positions", defaultsText() === "Primary,Work", defaultsText() )
    t.check( "Mutter reorder: the desktop keeps the wallpaper of the active Primary workspace",
        showsWallpaper( worksets.PRIMARY.wallpaper ), worksets.desktopWallpaperUri() )
    t.check( "switch to the Work workspace at its new position completes", await shell.activateWorkspace( 0 ) )
    t.check( "the Work workspace at its new position shows the Work wallpaper",
        showsWallpaper( worksets.WORK.wallpaper ), worksets.desktopWallpaperUri() )
}

/**
 * Mutter: removes the Work workspace, which is between the Primary and Play workspaces.
 * @param {object} t - The reporter
 */
const mutterRemove = async ( t ) => {
    worksets.addEnvironment( worksets.PLAY, PLAY_WORKSPACE )
    worksets.workspaceManager()._workspaceUpdate()
    global.workspace_manager.remove_workspace( shell.workspaceAt( worksets.WORK.workspace ), global.get_current_time() )
    t.check( "Mutter removal: the environment of the removed workspace closes",
        worksets.workspaceMapsWithCurrent( worksets.WORK.name ).length === 0, worksets.workspaceMapsWithCurrent( worksets.WORK.name ).join( "," ) )
    t.check( "Mutter removal: the environments after it move one workspace down", mapsText( FIXTURE_WORKSPACES ) === "Primary,Play,-",
        mapsText( FIXTURE_WORKSPACES ) )
    t.check( "Mutter removal: the default environments stay at their positions", defaultsText() === "Primary,Work", defaultsText() )
    t.check( "switch to the Play workspace at its new position completes", await shell.activateWorkspace( PLAY_WORKSPACE - 1 ) )
    t.check( "the Play workspace at its new position shows the Play wallpaper",
        showsWallpaper( worksets.PLAY.wallpaper ), worksets.desktopWallpaperUri() )
}

export default {
    name: "workspace-order",

    async run( t ) {
        await shell.activateWorkspace( worksets.PRIMARY.workspace )
        const { window, close } = await windows.openTestWindow( WINDOW_TITLE )
        if ( !t.check( "the test window opens", window !== undefined, `see test-window-${WINDOW_TITLE}.log` ) ) return

        try {
            for ( const scenario of [keyboardInsert, overviewDropInsert, mutterReorder, mutterRemove] ) {
                if ( !t.check( `${scenario.name}: the fixture workspaces are ready`, await reset( window ), `${shell.workspaceCount()} workspaces` ) )
                    return
                await scenario( t, window )
            }
        } finally {
            worksets.removeEnvironment( worksets.PLAY.name )
            await reset( window )
            t.check( "the test window closes", await close() )
        }
    },
}
