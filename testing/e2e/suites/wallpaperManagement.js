/*
 * Suite "wallpaper-management" (#70, PR #72): when wallpaper management is disabled, the extension
 * puts the GNOME wallpapers back, shows no environment wallpapers, and does not record wallpaper
 * changes from GNOME Settings in the environments.
 */

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

const SETTING_SETTLE_MS = 400
// GNOME loads a changed wallpaper in the background before it replaces its background actors
const GNOME_WALLPAPER_CHANGE_SETTLE_MS = 2000
const ENABLE_SETTLE_MS = 1500
const DISABLE_WALLPAPER_MANAGEMENT_KEY = "disable-wallpaper-management"
const GNOME_SETTINGS_WALLPAPER = "yellow"

export default {
    name: "wallpaper-management",

    async run( t ) {
        const settings = worksets.settings()
        const session = worksets.session()
        const workPreview = () => worksets.previewForWorkspace( worksets.WORK.workspace )
        const primaryWallpaperBefore = session.Worksets[0].BackgroundImage

        await shell.activateWorkspace( worksets.PRIMARY.workspace )
        t.check( "overview opens", await shell.showOverview() )

        settings.set_boolean( DISABLE_WALLPAPER_MANAGEMENT_KEY, true )
        await shell.sleep( SETTING_SETTLE_MS )
        t.check( "thumbnail wallpapers are removed", worksets.views().thumbnailBoxes.every( ( thumbnail ) => !thumbnail._worksetBgActor ) )
        const showsGnomeWallpaper = () => worksets.previewWallpaper( workPreview() ) === worksets.gnomeWallpaperFor( workPreview() )
        t.check( "Work preview shows the GNOME wallpaper", showsGnomeWallpaper() )
        t.check( "no GNOME background actors keep an environment wallpaper", worksets.views().backgrounds._overrides.size === 0,
            `${worksets.views().backgrounds._overrides.size} recorded` )
        await t.screenshot( "disabled" )

        worksets.desktopBackgroundSettings().set_string( "picture-uri", `file://${worksets.wallpaperPath( GNOME_SETTINGS_WALLPAPER )}` )
        await shell.sleep( GNOME_WALLPAPER_CHANGE_SETTLE_MS )
        t.check( "a wallpaper change from GNOME Settings is not recorded in the environment",
            session.Worksets[0].BackgroundImage === primaryWallpaperBefore, session.Worksets[0].BackgroundImage )
        t.check( "Work preview follows the GNOME wallpaper", showsGnomeWallpaper() )
        await t.screenshot( "disabled-after-gnome-change" )

        settings.set_boolean( DISABLE_WALLPAPER_MANAGEMENT_KEY, false )
        await shell.sleep( ENABLE_SETTLE_MS )
        const workWallpaper = worksets.loadedWallpaper( worksets.WORK.wallpaper )
        const workThumbnail = worksets.views().thumbnailBoxes[worksets.WORK.workspace]
        if ( workThumbnail )
            t.check( "enabled again: Work thumbnail shows the Work wallpaper", workThumbnail._worksetBgActor?.content.background === workWallpaper )
        t.check( "enabled again: Work preview shows the Work wallpaper", worksets.previewWallpaper( workPreview() ) === workWallpaper )
        t.check( "enabled again: desktop wallpaper setting is the Primary wallpaper",
            worksets.desktopWallpaperUri().endsWith( `/${worksets.PRIMARY.wallpaper}.png` ), worksets.desktopWallpaperUri() )
        await shell.hideOverview()
    },
}
