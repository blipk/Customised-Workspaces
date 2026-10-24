/*
 * End-to-end test entry point for the Customised Workspaces extension.
 *
 * run.sh starts GNOME Shell with "--automation-script" and this file. GNOME Shell imports the
 * module, waits for its performance helper, and then calls run() (see js/ui/scripting.js in
 * GNOME Shell). When run() completes, GNOME Shell stops with exit code 0. When run() throws,
 * GNOME Shell stops with an error exit code.
 *
 * Do not export functions with an underscore in their name: scripting.js calls them as
 * performance event handlers.
 */

// External imports
import GLib from "gi://GLib"

import * as Config from "resource:///org/gnome/shell/misc/config.js"
import * as Scripting from "resource:///org/gnome/shell/ui/scripting.js"

// Internal imports
import { Reporter } from "./lib/reporter.js"
import * as shell from "./lib/shell.js"
import * as worksets from "./lib/worksets.js"
import startup from "./suites/startup.js"
import notifications from "./suites/notifications.js"
import overviewWallpapers from "./suites/overviewWallpapers.js"
import wallpaperManagement from "./suites/wallpaperManagement.js"
import workspaceSwitch from "./suites/workspaceSwitch.js"
import favourites from "./suites/favourites.js"
import allEnvironments from "./suites/allEnvironments.js"
import panelMenu from "./suites/panelMenu.js"
import disable from "./suites/disable.js"

// The suites run in this order in one GNOME Shell session. "disable" must be last.
const SUITES = [
    startup,
    notifications,
    overviewWallpapers,
    wallpaperManagement,
    workspaceSwitch,
    favourites,
    allEnvironments,
    panelMenu,
    disable,
]

// GNOME Shell can wait for D-Bus services that the isolated session does not have before it enables extensions
const EXTENSION_ACTIVE_TIMEOUT_MS = 60000
const STARTUP_SETTLE_MS = 1500

/**
 * Selects the suites to run from a comma separated list of suite names.
 * @param {string|null} filter - The list, or null or "" for all suites
 * @returns {Array<object>} The suites, in run order
 */
const selectSuites = ( filter ) => {
    const names = ( filter ?? "" ).split( "," ).map( ( name ) => name.trim() ).filter( ( name ) => name !== "" )
    if ( names.length === 0 ) return SUITES
    return SUITES.filter( ( suite ) => names.includes( suite.name ) )
}

/** Runs the selected test suites. Called by GNOME Shell (js/ui/scripting.js). */
export async function run() {
    // The GNOME Shell performance helper stops after 30 s without calls, and the tests take longer.
    // Then scripting.js cannot stop it after run(), and GNOME Shell exits with an error code.
    // The helper stops by itself when the test session ends.
    await Scripting.disableHelperAutoExit()

    const reporter = new Reporter( {
        resultsPath   : GLib.getenv( "WSE2E_RESULTS_FILE" ),
        screenshotDir : GLib.getenv( "WSE2E_SCREENSHOT_DIR" ),
    } )
    reporter.note( `GNOME Shell ${Config.PACKAGE_VERSION}` )

    const suites = selectSuites( GLib.getenv( "WSE2E_SUITES" ) )
    reporter.note( `suites: ${suites.map( ( suite ) => suite.name ).join( ", " ) || "none (check --suites)"}` )

    const active = await shell.waitFor( worksets.isActive, EXTENSION_ACTIVE_TIMEOUT_MS )
    const extensionState = `state ${worksets.extension()?.state}, error ${worksets.extension()?.error}`
    if ( reporter.check( "the extension under test is active", active, extensionState ) ) {
        await shell.sleep( STARTUP_SETTLE_MS )
        await shell.prepareInput()
        for ( const suite of suites )
            await reporter.runSuite( suite )
    }

    reporter.finish()
    if ( reporter.failed > 0 )
        throw new Error( `${reporter.failed} checks failed` )
}
