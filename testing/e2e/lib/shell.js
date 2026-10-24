/* global global */

/*
 * Helpers for end-to-end tests that run inside GNOME Shell: waiting, the overview, workspaces,
 * screenshots, and virtual input devices that send real pointer and keyboard events through Clutter.
 */

// External imports
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import Shell from "gi://Shell"
import Clutter from "gi://Clutter"

import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as Scripting from "resource:///org/gnome/shell/ui/scripting.js"

const POLL_INTERVAL_MS = 100
const MICROSECONDS_PER_MILLISECOND = 1000
const OVERVIEW_TIMEOUT_MS = 5000
const OVERVIEW_SETTLE_MS = 1200
const OVERVIEW_HIDDEN_SETTLE_MS = 600
const WORKSPACE_SWITCH_TIMEOUT_MS = 5000
const WORKSPACE_SWITCH_SETTLE_MS = 1500
const POINTER_MOVE_SETTLE_MS = 150
const BUTTON_HOLD_MS = 60
const CLICK_SETTLE_MS = 400
const KEY_HOLD_MS = 30
const KEY_SETTLE_MS = 80

/** Waits for a number of milliseconds (GNOME Shell scripting helper). */
export const sleep = Scripting.sleep

/** Waits until GNOME Shell is idle (GNOME Shell scripting helper). */
export const waitLeisure = Scripting.waitLeisure

/**
 * Waits until a condition is true.
 * @param {function(): boolean} predicate - The condition. An exception counts as false.
 * @param {number} timeoutMs - Maximum time to wait
 * @param {number} [intervalMs=POLL_INTERVAL_MS] - Time between two tests of the condition
 * @returns {Promise<boolean>} True if the condition became true before the time-out
 */
export const waitFor = async ( predicate, timeoutMs, intervalMs = POLL_INTERVAL_MS ) => {
    const end = GLib.get_monotonic_time() + timeoutMs * MICROSECONDS_PER_MILLISECOND
    while ( GLib.get_monotonic_time() < end ) {
        try {
            if ( predicate() ) return true
        } catch ( e ) { /* not ready yet */ }
        await sleep( intervalMs )
    }
    return false
}

/**
 * Saves a screenshot of the full stage as a PNG file.
 * @param {string} path - Path of the PNG file
 * @returns {Promise<void>} Rejects if the screenshot fails
 */
export const saveScreenshot = ( path ) => new Promise( ( resolve, reject ) => {
    const stream = Gio.File.new_for_path( path ).replace( null, false, Gio.FileCreateFlags.NONE, null )
    new Shell.Screenshot().screenshot( false, stream, ( screenshot, result ) => {
        try {
            screenshot.screenshot_finish( result )
            resolve()
        } catch ( e ) {
            reject( e )
        } finally {
            stream.close( null )
        }
    } )
} )

// Overview and workspaces

/**
 * Shows the overview and waits until its animation is complete.
 * @param {object} [options] - Options
 * @param {boolean} [options.appGrid=false] - True to show the application grid
 * @returns {Promise<boolean>} True if the overview is visible
 */
export const showOverview = async ( { appGrid = false } = {} ) => {
    if ( appGrid )
        Main.overview.showApps()
    else
        Main.overview.show()
    const shown = await waitFor( () => Main.overview.visible && !Main.overview.animationInProgress, OVERVIEW_TIMEOUT_MS )
    await sleep( OVERVIEW_SETTLE_MS )
    return shown
}

/**
 * Hides the overview and waits until it is hidden.
 * @returns {Promise<boolean>} True if the overview is hidden
 */
export const hideOverview = async () => {
    Main.overview.hide()
    const hidden = await waitFor( () => !Main.overview.visible, OVERVIEW_TIMEOUT_MS )
    await sleep( OVERVIEW_HIDDEN_SETTLE_MS )
    return hidden
}

/** @returns {number} Index of the active workspace */
export const activeWorkspaceIndex = () => global.workspace_manager.get_active_workspace_index()

/**
 * Switches to a workspace and waits until the switch animation is complete.
 * @param {number} index - Index of the workspace
 * @returns {Promise<boolean>} True if the workspace is active
 */
export const activateWorkspace = async ( index ) => {
    if ( activeWorkspaceIndex() === index ) return true
    global.workspace_manager.get_workspace_by_index( index )?.activate( global.get_current_time() )
    const switched = await waitFor( () => activeWorkspaceIndex() === index, WORKSPACE_SWITCH_TIMEOUT_MS )
    await sleep( WORKSPACE_SWITCH_SETTLE_MS )
    return switched
}

// Virtual input

let virtualPointer = null
let virtualKeyboard = null

const ensureVirtualDevices = () => {
    const seat = global.stage.context.get_backend().get_default_seat()
    virtualPointer ??= seat.create_virtual_device( Clutter.InputDeviceType.POINTER_DEVICE )
    virtualKeyboard ??= seat.create_virtual_device( Clutter.InputDeviceType.KEYBOARD_DEVICE )
}

const eventTime = () => GLib.get_monotonic_time()

/**
 * Makes the virtual input devices and moves the pointer to the centre of the primary monitor.
 * Call this before the tests: GNOME Shell treats the first events of a new device differently
 * (for example, an open menu takes the first click of a new pointer as a click outside the menu).
 */
export const prepareInput = async () => {
    ensureVirtualDevices()
    const monitor = Main.layoutManager.primaryMonitor
    virtualPointer.notify_absolute_motion( eventTime(), monitor.x + monitor.width / 2, monitor.y + monitor.height / 2 )
    await sleep( POINTER_MOVE_SETTLE_MS )
}

/**
 * Clicks an actor with the primary button of a virtual pointer.
 * @param {Clutter.Actor} actor - The actor to click
 * @param {object} [position] - Position of the click in the actor, as fractions of its width and height
 * @param {number} [position.x=0.5] - Horizontal position, 0 is the left edge
 * @param {number} [position.y=0.5] - Vertical position, 0 is the top edge
 * @returns {Promise<{hit: boolean, picked: Clutter.Actor|null}>} hit is true if the pointer was on the actor
 *   or on one of its children. picked is the reactive actor below the pointer.
 */
export const click = async ( actor, { x = 0.5, y = 0.5 } = {} ) => {
    if ( !actor?.mapped ) return { hit: false, picked: null }
    ensureVirtualDevices()

    const [actorX, actorY] = actor.get_transformed_position()
    const [width, height] = actor.get_transformed_size()
    const pointerX = actorX + width * x
    const pointerY = actorY + height * y

    virtualPointer.notify_absolute_motion( eventTime(), pointerX, pointerY )
    await sleep( POINTER_MOVE_SETTLE_MS )
    const picked = global.stage.get_actor_at_pos( Clutter.PickMode.REACTIVE, pointerX, pointerY )
    const hit = picked === actor || actor.contains( picked )

    virtualPointer.notify_button( eventTime(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED )
    await sleep( BUTTON_HOLD_MS )
    virtualPointer.notify_button( eventTime(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED )
    await sleep( CLICK_SETTLE_MS )
    return { hit, picked }
}

/**
 * Presses and releases keys with a virtual keyboard.
 * @param {...number} keyvals - Key values, for example Clutter.KEY_Return
 */
export const pressKeys = async ( ...keyvals ) => {
    ensureVirtualDevices()
    for ( const keyval of keyvals ) {
        virtualKeyboard.notify_keyval( eventTime(), keyval, Clutter.KeyState.PRESSED )
        await sleep( KEY_HOLD_MS )
        virtualKeyboard.notify_keyval( eventTime(), keyval, Clutter.KeyState.RELEASED )
        await sleep( KEY_SETTLE_MS )
    }
}

/** @returns {Array<Clutter.Actor>} The modal dialogs that are visible now */
export const visibleModalDialogs = () => Main.layoutManager.modalDialogGroup.get_children().filter( ( dialog ) => dialog.visible )

/**
 * Finds the first descendant of an actor that matches a condition (depth first).
 * @param {Clutter.Actor} root - The actor to search in
 * @param {function(Clutter.Actor): boolean} predicate - The condition
 * @returns {Clutter.Actor|null} The actor, or null
 */
export const findActor = ( root, predicate ) => {
    for ( const child of root?.get_children() ?? [] ) {
        if ( predicate( child ) ) return child
        const found = findActor( child, predicate )
        if ( found ) return found
    }
    return null
}

/**
 * Records the emissions of signals while an action runs, for diagnostics.
 * @param {Array<[GObject.Object|object, string]>} sources - Pairs of object and signal name
 * @param {function(): Promise<void>} action - The action
 * @returns {Promise<Array<string>>} One "signal(arguments)" entry for each emission, in order
 */
export const recordSignals = async ( sources, action ) => {
    const emissions = []
    const connections = sources.map( ( [source, signal] ) => [source, source.connect( signal, ( _emitter, ...args ) => {
        emissions.push( `${signal}(${args.filter( ( arg ) => typeof arg !== "object" ).join( "," )})` )
        return false
    } )] )
    try {
        await action()
    } finally {
        connections.forEach( ( [source, id] ) => source.disconnect( id ) )
    }
    return emissions
}
