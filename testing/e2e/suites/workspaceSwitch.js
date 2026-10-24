/*
 * Suite "workspace-switch": a workspace switch from the desktop shows the environment wallpaper of each
 * workspace during the animation, and then applies the wallpaper and favourites of the new environment.
 */

// External imports
import GLib from "gi://GLib"

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

const SAMPLE_INTERVAL_MS = 15
const MID_ANIMATION_MS = 150
// One animation group for the workspace that the switch starts on and one for the target workspace
const EXPECTED_ANIMATION_GROUPS = 2

export default {
    name: "workspace-switch",

    async run( t ) {
        await shell.hideOverview()
        await shell.activateWorkspace( worksets.PRIMARY.workspace )
        const views = worksets.views()

        // Sample the animation groups while the switch animation runs
        let maxGroups = 0
        let maxGroupsWithWallpaper = 0
        const sampleId = GLib.timeout_add( GLib.PRIORITY_DEFAULT, SAMPLE_INTERVAL_MS, () => {
            const groups = [...views.wsGroups.keys()]
            maxGroups = Math.max( maxGroups, groups.length )
            maxGroupsWithWallpaper = Math.max( maxGroupsWithWallpaper, groups.filter( ( group ) => group._worksetBgActor ).length )
            return GLib.SOURCE_CONTINUE
        } )

        const switchDone = shell.activateWorkspace( worksets.WORK.workspace )
        await shell.sleep( MID_ANIMATION_MS )
        await t.screenshot( "animation" )
        t.check( "switch to the Work workspace completes", await switchDone )
        GLib.Source.remove( sampleId )

        t.check( "the animation groups are tracked", maxGroups >= EXPECTED_ANIMATION_GROUPS, `${maxGroups}` )
        t.check( "the animation groups show environment wallpapers",
            maxGroupsWithWallpaper >= EXPECTED_ANIMATION_GROUPS, `${maxGroupsWithWallpaper}` )
        t.check( "the animation groups are released after the switch", views.wsGroups.size === 0, `${views.wsGroups.size}` )
        t.check( "desktop wallpaper setting is the Work wallpaper",
            worksets.desktopWallpaperUri().endsWith( `/${worksets.WORK.wallpaper}.png` ), worksets.desktopWallpaperUri() )
        t.check( "dash favourites are the Work favourites",
            worksets.dashFavourites().join( "," ) === worksets.WORK.favourites.join( "," ), worksets.dashFavourites().join( "," ) )
        await t.screenshot( "work-desktop" )
    },
}
