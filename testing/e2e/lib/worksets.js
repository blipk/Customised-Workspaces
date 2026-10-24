/* global global */

/*
 * Access to the extension under test (worksets@blipk.xyz) and to the test fixtures.
 *
 * The fixtures (fixtures/session.template.json) define two environments:
 * - "Primary" on workspace 0, with the red wallpaper and the Console favourite
 * - "Work" on workspace 1, with the green wallpaper and the Text Editor favourite
 * The GNOME wallpaper setting starts as the blue wallpaper.
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
