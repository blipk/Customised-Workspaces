/*
 * Suite "all-environments" (#69): SessionManager.addFavoriteToAllWorksets() puts an application in the
 * favourites of every environment at a position, and keeps the position in the
 * "all-environments-app-position" setting as the default for the next time.
 * The suite "panel-menu" tests the menu flow (choose the application, then its position).
 */

// Internal imports
import * as worksets from "../lib/worksets.js"

const POSITION_KEY = "all-environments-app-position"
const DEFAULT_POSITION = -1
const PAST_THE_END_POSITION = 99
const CALCULATOR = { name: "org.gnome.Calculator.desktop", displayName: "Calculator", icon: "", exec: "gnome-calculator" }
const SETTINGS = { name: "org.gnome.Settings.desktop", displayName: "Settings", icon: "", exec: "gnome-control-center" }
// Input text -> position that the validator gives (null: not a whole number)
const VALIDATOR_CASES = [
    ["3", 3], [" -2 ", -2], ["500", 100], ["-500", -100], ["abc", null], ["1.5", null], ["", null],
]

const favouriteNames = ( workset ) => workset.FavApps.map( ( favApp ) => favApp.name )
const describe = ( session ) => session.Worksets.map( ( workset ) => favouriteNames( workset ).join( "|" ) ).join( " ; " )

export default {
    name: "all-environments",

    async run( t ) {
        const session = worksets.session()
        const savedFavourites = session.Worksets.map( ( workset ) => workset.FavApps.map( ( favApp ) => ( { ...favApp } ) ) )
        const savedPosition = worksets.options().AllEnvironmentsAppPosition

        try {
            t.check( "the last position is loaded from the settings", savedPosition === DEFAULT_POSITION, `${savedPosition}` )

            session.addFavoriteToAllWorksets( CALCULATOR, 1 )
            t.check( "position 1 puts the application first in all environments",
                session.Worksets.every( ( workset ) => workset.FavApps[0]?.name === CALCULATOR.name ), describe( session ) )
            t.check( "the dash of the active environment is updated", worksets.dashFavourites()[0] === CALCULATOR.name,
                worksets.dashFavourites().join( "," ) )
            t.check( "the position is kept as the last position", worksets.options().AllEnvironmentsAppPosition === 1 &&
                worksets.settings().get_int( POSITION_KEY ) === 1, `${worksets.settings().get_int( POSITION_KEY )}` )

            session.addFavoriteToAllWorksets( CALCULATOR, -1 )
            t.check( "an application that is already there moves to the new position, with no duplicate",
                session.Worksets.every( ( workset ) => workset.FavApps.at( -1 )?.name === CALCULATOR.name &&
                    favouriteNames( workset ).filter( ( name ) => name === CALCULATOR.name ).length === 1 ), describe( session ) )

            session.addFavoriteToAllWorksets( SETTINGS, -2 )
            t.check( "position -2 puts the application second last",
                session.Worksets.every( ( workset ) => workset.FavApps.at( -2 )?.name === SETTINGS.name ), describe( session ) )

            session.addFavoriteToAllWorksets( CALCULATOR )
            t.check( "with no position, the last position is used",
                session.Worksets.every( ( workset ) => workset.FavApps.at( -2 )?.name === CALCULATOR.name ), describe( session ) )

            session.addFavoriteToAllWorksets( SETTINGS, PAST_THE_END_POSITION )
            t.check( "a position after the end puts the application last",
                session.Worksets.every( ( workset ) => workset.FavApps.at( -1 )?.name === SETTINGS.name ), describe( session ) )

            const { InputValidator } = await worksets.importModule( "inputValidator.js" )
            for ( const [input, expected] of VALIDATOR_CASES ) {
                const actual = InputValidator.validateFavoritePosition( input )
                t.check( `the position validator gives ${expected} for ${JSON.stringify( input )}`, actual === expected, `${actual}` )
            }
        } finally {
            session.Worksets.forEach( ( workset, index ) => { workset.FavApps = savedFavourites[index] } )
            worksets.options().AllEnvironmentsAppPosition = savedPosition
            session.saveSession()
            session.setFavorites()
        }
    },
}
