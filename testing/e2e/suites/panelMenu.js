/*
 * Suite "panel-menu": the panel menu, the option items, the "Add app to all environments" flow
 * (choose the application, then its position) and the overview overlay buttons work with real
 * pointer and keyboard input. GNOME Shell 51 changed the menu APIs and moved menu input handling
 * to Clutter gestures and key controllers.
 */

// External imports
import St from "gi://St"
import Clutter from "gi://Clutter"

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

const MENU_SETTLE_MS = 800
const SUBMENU_SETTLE_MS = 500
const DIALOG_SETTLE_MS = 600
// Click on the label part of a menu item, not on its icon buttons
const LABEL_CLICK_POSITION = { x: 0.25 }
const POSITION_KEY = "all-environments-app-position"
const ADD_TO_ALL_LABEL = "Add app to all environments"
// The position dialog selects the last position, thus typing replaces it
const TYPED_POSITION = 2
const TYPE_POSITION_KEYS = [Clutter.KEY_2, Clutter.KEY_Return]
const CHOSEN_APP = { name: "org.gnome.Calculator.desktop", displayName: "Calculator", icon: "", exec: "gnome-calculator" }
const CANCELLED_APP = { name: "org.gnome.Settings.desktop", displayName: "Settings", icon: "", exec: "gnome-control-center" }

const describeClick = ( { hit, picked } ) => ( hit ? "" : `pointer was on ${picked}` )
const hasFavourite = ( app ) => worksets.session().Worksets.some( ( workset ) => workset.FavApps.some( ( favApp ) => favApp.name === app.name ) )

export default {
    name: "panel-menu",

    async run( t ) {
        const indicator = worksets.instance().worksetsIndicator
        const session = worksets.session()
        const savedPosition = worksets.options().AllEnvironmentsAppPosition
        const savedNotifications = worksets.options().ShowNotifications
        const savedFavourites = session.Worksets.map( ( workset ) => workset.FavApps.map( ( favApp ) => ( { ...favApp } ) ) )
        // Open the menu as a user does, with a click on the panel icon
        const openMenu = async () => {
            const result = await shell.click( indicator )
            await shell.sleep( MENU_SETTLE_MS )
            return result
        }
        await shell.hideOverview()

        try {
            let clickResult = await openMenu()
            t.check( "a click on the panel icon opens the panel menu", indicator.menu.isOpen, describeClick( clickResult ) )

            // Extension Options submenu
            const optionsItem = indicator.optionsMenuItem
            const emissions = await shell.recordSignals(
                [[optionsItem, "button-press-event"], [optionsItem, "button-release-event"], [optionsItem.menu, "open-state-changed"]],
                async () => { clickResult = await shell.click( optionsItem, LABEL_CLICK_POSITION ) }
            )
            await shell.sleep( SUBMENU_SETTLE_MS )
            t.check( "the click lands on 'Extension Options'", clickResult.hit, describeClick( clickResult ) )
            t.check( "the panel menu stays open", indicator.menu.isOpen )
            t.check( "the options submenu opens", optionsItem.menu.isOpen, `signals: ${emissions.join( " " ) || "none"}` )
            t.check( "the options submenu has the 'Add app to all environments' item",
                indicator.optionsMenuItems.some( ( item ) => item.label?.text === ADD_TO_ALL_LABEL ), `${indicator.optionsMenuItems.length} items` )
            await t.screenshot( "options" )

            const notificationsItem = indicator.optionsMenuItems.find( ( item ) => item.optionName === "ShowNotifications" )
            clickResult = await shell.click( notificationsItem, LABEL_CLICK_POSITION )
            t.check( "a click on a switch option toggles it", worksets.options().ShowNotifications === !savedNotifications,
                `${savedNotifications} -> ${worksets.options().ShowNotifications} ${describeClick( clickResult )}` )
            clickResult = await shell.click( notificationsItem, LABEL_CLICK_POSITION )
            t.check( "a second click toggles it back", worksets.options().ShowNotifications === savedNotifications,
                `${worksets.options().ShowNotifications} ${describeClick( clickResult )}` )

            // "Add app to all environments": one click, then the application chooser, then the position dialog.
            // The application chooser is a separate GTK process, thus the suite gives the chosen application.
            t.check( "the options submenu has no separate position option",
                !indicator.optionsMenuItems.some( ( item ) => item.optionName === "AllEnvironmentsAppPosition" ) )
            const addToAllItem = indicator.optionsMenuItems.find( ( item ) => item.label?.text === ADD_TO_ALL_LABEL )
            indicator._chooseApplication = ( _targetName, onChosen ) => onChosen( CHOSEN_APP )
            clickResult = await shell.click( addToAllItem, LABEL_CLICK_POSITION )
            await shell.sleep( DIALOG_SETTLE_MS )
            const [dialog] = shell.visibleModalDialogs()
            t.check( "one click on 'Add app to all environments' opens the position dialog after the application is chosen",
                Boolean( dialog ), describeClick( clickResult ) )
            t.check( "the position dialog names the application",
                Boolean( shell.findActor( dialog, ( actor ) => actor instanceof St.Label && actor.text?.includes( CHOSEN_APP.displayName ) ) ) )
            const entryText = dialog?.stEntryUText?.get_text()
            const selectedText = dialog?.stEntryUText?.clutter_text.get_selection()
            t.check( "the position dialog shows the last position, selected",
                entryText === String( savedPosition ) && selectedText === entryText, `text '${entryText}', selected '${selectedText}'` )
            await t.screenshot( "position-dialog" )

            await shell.pressKeys( ...TYPE_POSITION_KEYS )
            await shell.sleep( DIALOG_SETTLE_MS )
            t.check( "the application is added at the typed position in all environments",
                session.Worksets.every( ( workset ) => workset.FavApps[TYPED_POSITION - 1]?.name === CHOSEN_APP.name ),
                session.Worksets.map( ( workset ) => workset.FavApps.map( ( favApp ) => favApp.name ).join( "|" ) ).join( " ; " ) )
            const savedSetting = worksets.settings().get_int( POSITION_KEY )
            t.check( "the typed position is kept as the last position",
                worksets.options().AllEnvironmentsAppPosition === TYPED_POSITION && savedSetting === TYPED_POSITION,
                `option ${worksets.options().AllEnvironmentsAppPosition}, setting ${savedSetting}` )
            t.check( "the position dialog closes", shell.visibleModalDialogs().length === 0, `${shell.visibleModalDialogs().length} visible` )

            // Cancel in the position dialog adds nothing
            indicator._chooseApplication = ( _targetName, onChosen ) => onChosen( CANCELLED_APP )
            indicator._addApplicationToAllEnvironments()
            await shell.sleep( DIALOG_SETTLE_MS )
            t.check( "the position dialog opens again", shell.visibleModalDialogs().length === 1 )
            await shell.pressKeys( Clutter.KEY_Escape )
            await shell.sleep( DIALOG_SETTLE_MS )
            t.check( "Cancel closes the position dialog", shell.visibleModalDialogs().length === 0, `${shell.visibleModalDialogs().length} visible` )
            t.check( "Cancel adds the application to no environment", !hasFavourite( CANCELLED_APP ) )

            // Details of an environment
            indicator.menu.close()
            await shell.sleep( SUBMENU_SETTLE_MS )
            await openMenu()
            const workItem = indicator._worksetMenuItemsGetAll().find( ( item ) => item.workset?.WorksetName === worksets.WORK.name )
            clickResult = await shell.click( workItem, LABEL_CLICK_POSITION )
            await shell.sleep( SUBMENU_SETTLE_MS )
            t.check( "a click on an environment opens its details",
                indicator.popUpMenus.length === 1 && workItem?.worksetPopupMenu?.menu.isOpen === true, describeClick( clickResult ) )
            await t.screenshot( "environment-details" )
            indicator.menu.close()
            await shell.sleep( SUBMENU_SETTLE_MS )

            // Overview overlay button
            t.check( "overview opens", await shell.showOverview() )
            const overlay = worksets.views().wsvWorkspaces[shell.activeWorkspaceIndex()]?._worksetOverlayBox
            const editButton = overlay?.get_children()[1]?.get_children()
                .find( ( button ) => button.icon?.icon_name === "document-edit-symbolic" )
            if ( t.check( "the overlay has an edit button", Boolean( editButton ) ) ) {
                clickResult = await shell.click( editButton )
                await shell.sleep( DIALOG_SETTLE_MS )
                t.check( "the edit button opens the editor dialog", shell.visibleModalDialogs().length === 1, describeClick( clickResult ) )
                await t.screenshot( "editor-dialog" )
                await shell.pressKeys( Clutter.KEY_Escape )
                await shell.sleep( DIALOG_SETTLE_MS )
                const openDialogs = shell.visibleModalDialogs().length
                t.check( "Escape closes the editor dialog", openDialogs === 0, `${openDialogs} visible` )
            }
            await shell.hideOverview()
        } finally {
            indicator.menu.close()
            // Use the application chooser of the class again
            delete indicator._chooseApplication
            session.Worksets.forEach( ( workset, index ) => { workset.FavApps = savedFavourites[index] } )
            worksets.options().AllEnvironmentsAppPosition = savedPosition
            worksets.options().ShowNotifications = savedNotifications
            session.saveSession()
            session.setFavorites()
        }
    },
}
