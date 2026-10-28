/*
 * A small GTK 4 window for the end-to-end tests: "gjs -m test-window.js TITLE". lib/windows.js starts it
 * in the test session, so that suites can put real windows on workspaces. It stays open until it is closed.
 */

// External imports
import GLib from "gi://GLib"
import Gtk from "gi://Gtk?version=4.0"
import System from "system"

const DEFAULT_TITLE = "Test window"
const DEFAULT_WIDTH = 480
const DEFAULT_HEIGHT = 320

Gtk.init()
const loop = new GLib.MainLoop( null, false )
const window = new Gtk.Window( {
    title          : System.programArgs[0] ?? DEFAULT_TITLE,
    default_width  : DEFAULT_WIDTH,
    default_height : DEFAULT_HEIGHT,
} )
window.connect( "close-request", () => {
    loop.quit()
    return false
} )
window.present()
loop.run()
