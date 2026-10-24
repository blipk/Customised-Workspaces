/* global global */

/*
 * Suite "overview-wallpapers": the overview shows the wallpaper of each environment in the
 * workspace thumbnails and in the workspace previews, and shows the environment overlay.
 */

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

// GNOME Shell 51 decodes wallpapers in the background
const WALLPAPER_LOAD_TIMEOUT_MS = 10000
const AFTER_LOAD_SETTLE_MS = 600

export default {
    name: "overview-wallpapers",

    async run( t ) {
        await shell.hideOverview()
        await shell.activateWorkspace( worksets.PRIMARY.workspace )
        t.check( "overview opens", await shell.showOverview() )

        const primaryWallpaper = () => worksets.loadedWallpaper( worksets.PRIMARY.wallpaper )
        const workWallpaper = () => worksets.loadedWallpaper( worksets.WORK.wallpaper )
        const loaded = await shell.waitFor( () => primaryWallpaper() && workWallpaper(), WALLPAPER_LOAD_TIMEOUT_MS )
        if ( !t.check( "environment wallpapers load", loaded ) ) return
        await shell.sleep( AFTER_LOAD_SETTLE_MS )

        // Workspace thumbnails at the top of the overview
        const thumbnails = worksets.views().thumbnailBoxes
        if ( thumbnails.length < 2 ) {
            t.skip( "thumbnails show environment wallpapers", `GNOME shows ${thumbnails.length} thumbnails` )
        } else {
            const primaryThumbnail = thumbnails[worksets.PRIMARY.workspace]
            const workThumbnail = thumbnails[worksets.WORK.workspace]
            t.check( "Primary thumbnail shows the Primary wallpaper", primaryThumbnail._worksetBgActor?.content.background === primaryWallpaper() )
            t.check( "Work thumbnail shows the Work wallpaper", workThumbnail._worksetBgActor?.content.background === workWallpaper() )
            t.check( "thumbnail wallpaper is below the window clones",
                primaryThumbnail._contents.get_first_child() === primaryThumbnail._worksetBgActor )
        }

        // Large workspace previews
        t.check( "Primary preview shows the Primary wallpaper",
            worksets.previewWallpaper( worksets.previewForWorkspace( worksets.PRIMARY.workspace ) ) === primaryWallpaper() )
        t.check( "Work preview shows the Work wallpaper",
            worksets.previewWallpaper( worksets.previewForWorkspace( worksets.WORK.workspace ) ) === workWallpaper() )

        const emptyIndex = [...Array( global.workspace_manager.n_workspaces ).keys()].find( ( index ) => !worksets.worksetOnWorkspace( index ) )
        if ( emptyIndex === undefined )
            t.skip( "a workspace without an environment shows the default environment wallpaper", "all workspaces have an environment" )
        else
            t.check( "a workspace without an environment shows the default environment wallpaper",
                worksets.previewWallpaper( worksets.previewForWorkspace( emptyIndex ) ) === primaryWallpaper(), `workspace ${emptyIndex}` )

        t.check( "Work preview has the environment overlay", Boolean( worksets.views().wsvWorkspaces[worksets.WORK.workspace]?._worksetOverlayBox ) )
        await t.screenshot( "overview" )
        await shell.hideOverview()
    },
}
