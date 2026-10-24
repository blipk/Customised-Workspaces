/*
 * Suite "disable" (#70): when the extension is disabled (as when it is uninstalled), it puts the
 * GNOME wallpapers back and removes everything that it added. Later GNOME wallpaper changes show
 * everywhere. Then the extension can be enabled again.
 */

// External imports
import * as Main from "resource:///org/gnome/shell/ui/main.js"

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

// GNOME loads a changed wallpaper in the background before it replaces its background actors
const GNOME_WALLPAPER_CHANGE_SETTLE_MS = 2500
const ENABLE_SETTLE_MS = 1500
const GNOME_SETTINGS_WALLPAPER = "blue"

export default {
    name: "disable",

    async run( t ) {
        await shell.activateWorkspace( worksets.WORK.workspace )
        t.check( "overview opens", await shell.showOverview() )
        const views = worksets.views()
        const workPreview = worksets.previewForWorkspace( worksets.WORK.workspace )
        const thumbnails = views.thumbnailBoxes
        const workspaceViews = views.wsvWorkspaces
        t.check( "before disable: Work preview shows the Work wallpaper",
            worksets.previewWallpaper( workPreview ) === worksets.loadedWallpaper( worksets.WORK.wallpaper ) )

        if ( !t.check( "the extension is disabled", await worksets.disable() ) ) return
        t.check( "Work preview shows the GNOME wallpaper", worksets.previewWallpaper( workPreview ) === worksets.gnomeWallpaperFor( workPreview ) )
        t.check( "no thumbnail wallpaper actors are left", thumbnails.every( ( thumbnail ) => !thumbnail._worksetBgActor ) )
        t.check( "no overview overlays are left", workspaceViews.every( ( view ) => !view._worksetOverlayBox ) )
        t.check( "no thumbnail labels are left", thumbnails.every( ( thumbnail ) => !thumbnail.worksetLabel ) )
        await t.screenshot( "overview-after-disable" )
        await shell.hideOverview()

        // A wallpaper change after the extension is uninstalled
        const wallpaperUri = `file://${worksets.wallpaperPath( GNOME_SETTINGS_WALLPAPER )}`
        worksets.desktopBackgroundSettings().set_string( "picture-uri", wallpaperUri )
        worksets.desktopBackgroundSettings().set_string( "picture-uri-dark", wallpaperUri )
        await shell.sleep( GNOME_WALLPAPER_CHANGE_SETTLE_MS )
        const desktopManager = Main.layoutManager._bgManagers[0]
        t.check( "the desktop follows the GNOME wallpaper",
            desktopManager.backgroundActor.content.background === desktopManager._backgroundSource.getBackground( desktopManager._monitorIndex ) )
        await t.screenshot( "desktop-after-gnome-change" )

        t.check( "overview opens", await shell.showOverview() )
        const primaryView = Main.overview._overview.controls._workspacesDisplay?._workspacesViews?.[Main.layoutManager.primaryIndex]
        const previews = primaryView?._workspaces ?? []
        t.check( "all overview previews follow the GNOME wallpaper",
            previews.length > 0 && previews.every( ( preview ) => worksets.previewWallpaper( preview ) === worksets.gnomeWallpaperFor( preview ) ),
            `${previews.length} previews` )
        await t.screenshot( "overview-after-gnome-change" )
        await shell.hideOverview()

        if ( !t.check( "the extension can be enabled again", await worksets.enable() ) ) return
        await shell.sleep( ENABLE_SETTLE_MS )
        t.check( "overview opens", await shell.showOverview() )
        const workPreviewAgain = worksets.previewForWorkspace( worksets.WORK.workspace )
        t.check( "enabled again: Work preview shows the Work wallpaper",
            worksets.previewWallpaper( workPreviewAgain ) === worksets.loadedWallpaper( worksets.WORK.wallpaper ) )
        await t.screenshot( "overview-enabled-again" )
        await shell.hideOverview()
    },
}
