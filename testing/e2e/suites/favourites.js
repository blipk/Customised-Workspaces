/* global global */

/*
 * Suite "favourites" (PR #71): a favourites change from the extension does not rebuild the hidden
 * app grid at once (GNOME rebuilds it when it is shown), and the same favourites are not written again.
 */

// External imports
import GLib from "gi://GLib"

import * as Main from "resource:///org/gnome/shell/ui/main.js"

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

const MICROSECONDS_PER_MILLISECOND = 1000
const DESKTOP_FILE_SUFFIX = ".desktop"

export default {
    name: "favourites",

    async run( t ) {
        const session = worksets.session()
        const appDisplay = Main.overview._overview.controls.appDisplay

        // Show the app grid once, so that GNOME builds it
        await shell.showOverview( { appGrid: true } )
        await shell.hideOverview()

        // An application in the grid (not in a folder) that is not a favourite
        const testApp = [...appDisplay._items.keys()]
            .find( ( id ) => id.endsWith( DESKTOP_FILE_SUFFIX ) && !worksets.dashFavourites().includes( id ) )
        if ( !testApp ) {
            t.skip( "a favourites change does not rebuild the hidden app grid", "no application in the app grid" )
            return
        }
        t.note( `favourites: test application ${testApp}` )
        const inGrid = () => appDisplay._items.has( testApp )
        const newFavourites = [...worksets.dashFavourites(), testApp].map( ( name ) => ( { name } ) )

        const started = GLib.get_monotonic_time()
        session.setFavorites( newFavourites )
        const elapsedMs = ( GLib.get_monotonic_time() - started ) / MICROSECONDS_PER_MILLISECOND
        t.check( "the favourites are written", worksets.dashFavourites().includes( testApp ) )
        t.check( "the hidden app grid is not rebuilt at once", inGrid(), `setFavorites took ${elapsedMs.toFixed( 1 )} ms` )
        t.check( "the favourites write flag is reset", session.favoritesSet === false )

        await shell.showOverview( { appGrid: true } )
        t.check( "the app grid is rebuilt when it is shown", !inGrid() )
        await shell.hideOverview()

        let writes = 0
        const changedId = global.settings.connect( "changed::favorite-apps", () => writes++ )
        session.setFavorites( newFavourites )
        global.settings.disconnect( changedId )
        t.check( "the same favourites are not written again", writes === 0, `${writes} writes` )

        // Show the favourites of the environment again
        session.setFavorites()
    },
}
