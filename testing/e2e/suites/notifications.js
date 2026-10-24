/*
 * Suite "notifications": the notification labels of the extension (uiUtils.showUserNotification())
 * fade out over the given time, a new notification replaces the old one, and faded labels are destroyed.
 */

// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

// showUserNotification() fades the label out over 2.9 s
const DURING_FADE_MS = 1000
const AFTER_FADE_TIMEOUT_MS = 5000

export default {
    name: "notifications",

    async run( t ) {
        const uiUtils = await worksets.importModule( "lib/ui/uiUtils.js" )
        // Wait for notifications from earlier steps
        await shell.waitFor( () => uiUtils.messages.length === 0, AFTER_FADE_TIMEOUT_MS )

        const first = uiUtils.showUserNotification( "e2e first notification" )
        const second = uiUtils.showUserNotification( "e2e second notification" )
        t.check( "a new notification replaces the old one", uiUtils.messages.length === 1 && uiUtils.messages[0] === second,
            `${uiUtils.messages.length} labels` )
        t.check( "the replaced notification is not in the list", !uiUtils.messages.includes( first ) )

        await shell.sleep( DURING_FADE_MS )
        t.check( "the notification is still visible during its fade",
            second.get_parent() !== null && second.opacity > 0, `opacity ${second.opacity}` )
        await t.screenshot( "fading" )

        // A label that is already removed must not cause an error
        uiUtils.removeUserNotification( first )
        uiUtils.removeUserNotification( first, 1 )

        const removed = await shell.waitFor( () => uiUtils.messages.length === 0, AFTER_FADE_TIMEOUT_MS )
        t.check( "the notification is removed after its fade", removed, `${uiUtils.messages.length} labels` )
    },
}
