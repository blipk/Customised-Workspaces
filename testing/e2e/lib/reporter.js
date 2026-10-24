/*
 * Test reporter for the end-to-end tests.
 *
 * The reporter writes one line for each result to the results file. It writes the file again
 * after each line, thus the results before a crash or a time-out are kept.
 *
 * Line formats (the runner script reads these):
 *   SUITE <suite>
 *   PASS <suite> > <check>[ -- <detail>]
 *   FAIL <suite> > <check>[ -- <detail>]
 *   SKIP <suite> > <check> -- <reason>
 *   NOTE <text>
 *   DONE <summary>
 */

// External imports
import GLib from "gi://GLib"

// Internal imports
import * as shell from "./shell.js"

export class Reporter {
    /**
     * @param {object} paths - Output paths
     * @param {string} paths.resultsPath - Path of the results file
     * @param {string} paths.screenshotDir - Directory for screenshots
     */
    constructor( { resultsPath, screenshotDir } ) {
        this._resultsPath = resultsPath
        this._screenshotDir = screenshotDir
        this._lines = []
        this.suiteName = "setup"
        this.passed = 0
        this.failed = 0
        this.skipped = 0
    }

    /**
     * Runs a test suite. An exception in the suite is a failed check.
     * @param {{name: string, run: function(Reporter): Promise<void>}} suite - The suite
     */
    async runSuite( suite ) {
        this.suiteName = suite.name
        this._write( `SUITE ${suite.name}` )
        try {
            await suite.run( this )
        } catch ( e ) {
            this.check( "suite completes without an exception", false, `${e}\n${e.stack}` )
        }
    }

    /**
     * Records a check.
     * @param {string} name - What the check verifies
     * @param {boolean} condition - True if the check passed
     * @param {string|number} [detail=""] - Extra information, for example the actual value
     * @returns {boolean} The condition, so that a suite can stop when a precondition fails
     */
    check( name, condition, detail = "" ) {
        const passed = Boolean( condition )
        if ( passed )
            this.passed++
        else
            this.failed++
        this._write( `${passed ? "PASS" : "FAIL"} ${this.suiteName} > ${name}${detail === "" ? "" : ` -- ${detail}`}` )
        return passed
    }

    /**
     * Records a check that could not run in this environment.
     * @param {string} name - What the check verifies
     * @param {string} reason - Why the check did not run
     */
    skip( name, reason ) {
        this.skipped++
        this._write( `SKIP ${this.suiteName} > ${name} -- ${reason}` )
    }

    /**
     * Records information that is not a check.
     * @param {string} text - The information
     */
    note( text ) {
        this._write( `NOTE ${text}` )
    }

    /**
     * Saves a screenshot of the stage as <screenshot dir>/<suite>-<name>.png.
     * @param {string} name - Name of the screenshot in the suite
     */
    async screenshot( name ) {
        const path = GLib.build_filenamev( [this._screenshotDir, `${this.suiteName}-${name}.png`] )
        try {
            await shell.saveScreenshot( path )
        } catch ( e ) {
            this.note( `Could not save screenshot ${path}: ${e}` )
        }
    }

    /** Records the end of the test run. The runner treats a results file without this line as an incomplete run. */
    finish() {
        this._write( `DONE ${this.passed} passed, ${this.failed} failed, ${this.skipped} skipped` )
    }

    _write( line ) {
        this._lines.push( line )
        GLib.file_set_contents( this._resultsPath, this._lines.join( "\n" ) + "\n" )
    }
}
