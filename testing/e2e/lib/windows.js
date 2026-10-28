/* global global */

/*
 * Test windows: GTK 4 windows of separate processes (fixtures/test-window.js), so that suites can put real
 * windows on workspaces. The output of each process goes to "test-window-TITLE.log" in the output directory.
 */

// External imports
import GLib from "gi://GLib"
import Gio from "gi://Gio"

// Internal imports
import { waitFor } from "./shell.js"

const WINDOW_TIMEOUT_MS = 15000
const CLIENT_PATH = GLib.build_filenamev( [
    GLib.path_get_dirname( GLib.filename_from_uri( import.meta.url )[0] ), "..", "fixtures", "test-window.js",
] )
const CLIENT_ENVIRONMENT = {
    WAYLAND_DISPLAY : GLib.getenv( "WSE2E_WAYLAND_DISPLAY" ),
    GDK_BACKEND     : "wayland",
    // Software rendering and no accessibility bus: the test session has no GPU guarantee and no AT-SPI
    GSK_RENDERER    : "cairo",
    GTK_A11Y        : "none",
}

/**
 * @param {string} title - Title of a window
 * @returns {Meta.Window|undefined} The first window with this title
 */
export const findWindow = ( title ) =>
    global.get_window_actors().map( ( actor ) => actor.meta_window ).find( ( window ) => window.get_title() === title )

/**
 * Opens a test window on the active workspace, and waits until GNOME Shell manages it.
 * @param {string} title - Title of the window. Use a different title for each open window.
 * @returns {Promise<{window: Meta.Window|undefined, close: function(): Promise<boolean>}>} The window (undefined if it
 *   did not open in time), and a function that closes it and gives true when the window is gone
 */
export const openTestWindow = async ( title ) => {
    const launcher = new Gio.SubprocessLauncher( { flags: Gio.SubprocessFlags.STDERR_MERGE } )
    for ( const [name, value] of Object.entries( CLIENT_ENVIRONMENT ) ) launcher.setenv( name, value, true )
    launcher.set_stdout_file_path( GLib.build_filenamev( [GLib.getenv( "WSE2E_OUTPUT_DIR" ), `test-window-${title}.log`] ) )
    const client = launcher.spawnv( ["gjs", "-m", CLIENT_PATH, title] )

    await waitFor( () => findWindow( title ) !== undefined, WINDOW_TIMEOUT_MS )
    const close = async () => {
        // Mutter needs a real timestamp to ping the window. global.get_current_time() is 0 outside of an event.
        findWindow( title )?.delete( global.display.get_current_time_roundtrip() )
        const closed = await waitFor( () => findWindow( title ) === undefined, WINDOW_TIMEOUT_MS )
        client.force_exit()
        return closed
    }
    return { window: findWindow( title ), close }
}
