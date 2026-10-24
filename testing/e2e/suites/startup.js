/* global global */

/*
 * Suite "startup": the extension loads the session fixture and applies the environment of workspace 0.
 */

// Internal imports
import * as worksets from "../lib/worksets.js"

const MINIMUM_WORKSPACES = 2

export default {
    name: "startup",

    async run( t ) {
        const debugMode = worksets.options().DebugMode
        t.check( "extension debug logging is enabled", debugMode === true, `${debugMode}` )
        t.check( "desktop wallpaper setting is the Primary wallpaper",
            worksets.desktopWallpaperUri().endsWith( `/${worksets.PRIMARY.wallpaper}.png` ), worksets.desktopWallpaperUri() )
        t.check( "dash favourites are the Primary favourites",
            worksets.dashFavourites().join( "," ) === worksets.PRIMARY.favourites.join( "," ), worksets.dashFavourites().join( "," ) )
        t.check( "the workspace of the Work environment exists",
            global.workspace_manager.n_workspaces >= MINIMUM_WORKSPACES, `${global.workspace_manager.n_workspaces} workspaces` )
    },
}
