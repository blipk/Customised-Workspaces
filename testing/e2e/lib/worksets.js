/* global global */

/*
 * Access to the extension under test (worksets@blipk.xyz) and to the test fixtures.
 *
 * The fixtures (fixtures/session.template.json) define two environments:
 * - "Primary" on workspace 0, with the red wallpaper and the Console favourite
 * - "Work" on workspace 1, with the green wallpaper and the Text Editor favourite
 * The GNOME wallpaper setting starts as the blue wallpaper.
 *
 * Suites can add the "Play" environment (PLAY) at run time with addEnvironment(), on a workspace
 * that GNOME does not have at start-up.
 */

// External imports
import GLib from "gi://GLib"
import Gio from "gi://Gio"

import * as Main from "resource:///org/gnome/shell/ui/main.js"
import { ExtensionState } from "resource:///org/gnome/shell/misc/extensionUtils.js"

// Internal imports
import { waitFor } from "./shell.js"

export const UUID = "worksets@blipk.xyz"
export const PRIMARY = { name: "Primary", workspace: 0, wallpaper: "red", favourites: ["org.gnome.Console.desktop"] }
export const WORK = { name: "Work", workspace: 1, wallpaper: "green", favourites: ["org.gnome.TextEditor.desktop"] }
// Not in the fixtures. It has no favourites, thus a change to the favourites of another environment is easy to see.
export const PLAY = { name: "Play", wallpaper: "yellow", favourites: [] }
const WALLPAPER_STYLE = "ZOOM"
const STATE_TIMEOUT_MS = 10000

const wallpaperDir = GLib.getenv( "WSE2E_WALLPAPER_DIR" )
let backgroundSettings = null

/**
 * @param {string} name - Name of a fixture wallpaper, for example "red"
 * @returns {string} Path of the wallpaper file
 */
export const wallpaperPath = ( name ) => GLib.build_filenamev( [wallpaperDir, `${name}.png`] )

/** @returns {Gio.Settings} The GNOME desktop background settings */
export const desktopBackgroundSettings = () => {
    backgroundSettings ??= new Gio.Settings( { schema_id: "org.gnome.desktop.background" } )
    return backgroundSettings
}

/** @returns {string} The GNOME "picture-uri" setting */
export const desktopWallpaperUri = () => desktopBackgroundSettings().get_string( "picture-uri" )

// Extension state

/** @returns {object|undefined} The extension record of the GNOME extension manager */
export const extension = () => Main.extensionManager.lookup( UUID )
/** @returns {boolean} True if the extension is enabled and running */
export const isActive = () => extension()?.state === ExtensionState.ACTIVE
/** @returns {boolean} True if the extension is disabled */
export const isInactive = () => extension()?.state === ExtensionState.INACTIVE

/** @returns {object|undefined} The extension object, which is "Me" (WorksetsInstance) in the extension modules */
export const instance = () => extension()?.stateObj
/** @returns {object|undefined} The SessionManager */
export const session = () => instance()?.session
/**
 * @returns {object|undefined} The options of the session. Read them again after each change:
 *   applySession() can load the session file again, which replaces the options object.
 */
export const options = () => session()?.activeSession.Options
/** @returns {object|undefined} The WorkspaceViewManager */
export const views = () => instance()?.workspaceViewManager
/** @returns {object|undefined} The WorkspaceManager */
export const workspaceManager = () => instance()?.workspaceManager
/** @returns {Gio.Settings|undefined} The extension settings */
export const settings = () => instance()?.settings

/**
 * Disables the extension, as GNOME does when the extension is uninstalled.
 * @returns {Promise<boolean>} True if the extension is inactive
 */
export const disable = async () => {
    Main.extensionManager.disableExtension( UUID )
    return waitFor( isInactive, STATE_TIMEOUT_MS )
}

/**
 * Enables the extension.
 * @returns {Promise<boolean>} True if the extension is active
 */
export const enable = async () => {
    Main.extensionManager.enableExtension( UUID )
    return waitFor( isActive, STATE_TIMEOUT_MS )
}

/**
 * Imports a module of the extension under test. GJS caches modules by URL, thus this gives the
 * same module instance that the extension uses.
 * @param {string} fileName - File name in the extension directory, for example "inputValidator.js"
 * @returns {Promise<object>} The module
 */
export const importModule = ( fileName ) => import( `${extension().dir.get_uri()}/${fileName}` )

// Environments

/**
 * Adds an environment to the session, makes it the current environment of a workspace, and saves the session file.
 * The extension does not update its workspaces: call workspaceManager()._workspaceUpdate() for that.
 * @param {{name: string, wallpaper: string, favourites: Array<string>}} environment - The environment, for example PLAY
 * @param {number} workspaceIndex - Index of the workspace
 */
export const addEnvironment = ( environment, workspaceIndex ) => {
    const current = session()
    // Change the session arrays and objects in place: saveSession() compares them with the saved session
    current.Worksets.push( {
        WorksetName         : environment.name,
        WindowData          : null,
        BackgroundImage     : wallpaperPath( environment.wallpaper ),
        BackgroundImageDark : wallpaperPath( environment.wallpaper ),
        BackgroundStyle     : WALLPAPER_STYLE,
        BackgroundStyleDark : WALLPAPER_STYLE,
        FavApps             : environment.favourites.map( ( name ) => ( { name, displayName: name, icon: "", exec: "" } ) ),
    } )
    current.workspaceMaps[`Workspace${workspaceIndex}`] = { defaultWorkset: "", currentWorkset: environment.name }
    current.saveSession()
}

/**
 * Removes an environment from the session and from all workspace maps, and saves the session file.
 * @param {string} name - Name of the environment
 */
export const removeEnvironment = ( name ) => {
    const current = session()
    const index = current.Worksets.findIndex( ( workset ) => workset.WorksetName === name )
    if ( index > -1 ) current.Worksets.splice( index, 1 )
    for ( const workspaceMap of Object.values( current.workspaceMaps ) ) {
        if ( workspaceMap.currentWorkset === name ) workspaceMap.currentWorkset = ""
        if ( workspaceMap.defaultWorkset === name ) workspaceMap.defaultWorkset = ""
    }
    current.saveSession()
}

/**
 * @param {string} name - Name of an environment
 * @returns {Array<string>} The keys of the workspace maps that have the environment as the current environment
 */
export const workspaceMapsWithCurrent = ( name ) =>
    Object.entries( session()?.workspaceMaps ?? {} ).filter( ( [, workspaceMap] ) => workspaceMap.currentWorkset === name ).map( ( [key] ) => key )

/**
 * @param {object} workspaceMaps - Workspace maps, from the extension session or from the session file
 * @param {number} count - Number of workspace positions
 * @param {string} [field="currentWorkset"] - "currentWorkset" or "defaultWorkset"
 * @returns {string} The environments of the first positions, "-" for none, for example "Primary,-,Work"
 */
export const workspaceMapsText = ( workspaceMaps, count, field = "currentWorkset" ) =>
    Array.from( { length: count }, ( _, index ) => workspaceMaps[`Workspace${index}`]?.[field] || "-" ).join( "," )

/**
 * Makes the environments of the fixtures (Primary on workspace 0, Work on workspace 1) the only current
 * environments. Then the extension updates its workspaces and shows the environment of the active workspace,
 * as after a workspace switch.
 */
export const resetCurrentWorksets = () => {
    const current = session()
    for ( const [key, workspaceMap] of Object.entries( current.workspaceMaps ) )
        workspaceMap.currentWorkset = { [`Workspace${PRIMARY.workspace}`]: PRIMARY.name, [`Workspace${WORK.workspace}`]: WORK.name }[key] ?? ""
    current.saveSession()
    workspaceManager()._activeWorkspaceChanged()
}

// Session file

/** @returns {string} Path of the session file of the extension */
export const sessionFilePath = () => GLib.build_filenamev( [GLib.get_user_config_dir(), UUID, "session.json"] )

/** @returns {object} The session that the session file contains */
export const readSessionFile = () => JSON.parse( new TextDecoder().decode( GLib.file_get_contents( sessionFilePath() )[1] ) )

/**
 * Changes the session file, for example while the extension is disabled.
 * @param {function(object): void} edit - Changes the session object in place
 */
export const editSessionFile = ( edit ) => {
    const sessionObject = readSessionFile()
    edit( sessionObject )
    GLib.file_set_contents( sessionFilePath(), JSON.stringify( sessionObject, null, 1 ) )
}

// Wallpapers

/**
 * @param {string} name - Name of a fixture wallpaper, for example "red"
 * @returns {Meta.Background|null} The wallpaper from the extension cache, or null if it is not loaded
 */
export const loadedWallpaper = ( name ) => views()?.backgrounds.lookup( wallpaperPath( name ), WALLPAPER_STYLE ) ?? null

/**
 * @param {number} index - Index of a workspace
 * @returns {Clutter.Actor|undefined} The overview workspace preview (workspace.Workspace) of the workspace
 */
export const previewForWorkspace = ( index ) =>
    [...( views()?.gsWorkspaces.keys() ?? [] )].find( ( preview ) => preview.metaWorkspace?.index() === index )

/**
 * @param {Clutter.Actor} preview - An overview workspace preview
 * @returns {Meta.Background|null} The wallpaper that the preview shows
 */
export const previewWallpaper = ( preview ) => preview?._background?._bgManager?.backgroundActor?.content?.background ?? null

/**
 * @param {Clutter.Actor} preview - An overview workspace preview
 * @returns {Meta.Background|null} The GNOME wallpaper for the preview, from the GNOME background cache
 */
export const gnomeWallpaperFor = ( preview ) => {
    const bgManager = preview?._background?._bgManager
    return bgManager?._backgroundSource?.getBackground( bgManager._monitorIndex ) ?? null
}

/**
 * @param {number} index - Index of a workspace
 * @returns {object|undefined} The workset that is active on the workspace
 */
export const worksetOnWorkspace = ( index ) => {
    const workspaceMap = session()?.workspaceMaps[`Workspace${index}`]
    return session()?.Worksets.find( ( workset ) => workset.WorksetName === workspaceMap?.currentWorkset )
}

/** @returns {Array<string>} The dash favourites (GNOME "favorite-apps" setting) */
export const dashFavourites = () => global.settings.get_strv( "favorite-apps" )
