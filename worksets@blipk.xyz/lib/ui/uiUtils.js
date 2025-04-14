/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) 2023 A.D. http://github.com/blipk
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// External imports
import St from "gi://St"
import GLib from "gi://GLib"
import Cogl from "gi://Cogl"
import Clutter from "gi://Clutter"
import GdkPixbuf from "gi://GdkPixbuf"

import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js"

import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as popupMenu from "resource:///org/gnome/shell/ui/popupMenu.js"

// Internal imports
import { WorksetsInstance as Me } from "../../extension.js"
import * as dev from "../../dev.js"

//For adding IconButtons on to PanelMenu.MenuItem buttons or elsewhere
export function createIconButton( parentItem, iconNames, callback, options, tooltip ) { //St.Side.RIGHT
    try {
        if ( Array.isArray( iconNames ) )
            var [iconNameURI,
                alternateIconName] = iconNames
        else iconNameURI = iconNames
        let defaults = {
            icon_name   : iconNameURI,
            style_class : "worksets-icon-button",
            x_expand    : false,
            x_align     : Clutter.ActorAlign.CENTER,
            y_expand    : true,
            y_align     : Clutter.ActorAlign.CENTER
        }
        options = { ...defaults, ...options }
        //dev.log(iconNameURI, options)

        let icon = new St.Icon( options )
        let iconButton = new St.Button( {
            child: icon, style_class: options.style_class || "worksets-icon-button", can_focus: true, x_expand: false, y_expand: false,
        } )
        iconButton.icon = icon
        parentItem.add_child ? parentItem.add_child( iconButton ) : parentItem.actor.add_child( iconButton )
        parentItem.iconButtons = parentItem.iconButtons || new Array()
        parentItem.iconsButtonsPressIds = parentItem.iconButtons || new Array()
        if ( tooltip ) {
            iconButton.tooltip = tooltip
            createTooltip( iconButton, tooltip )
        }
        parentItem.iconButtons.push( iconButton )

        iconButton.focus = false
        iconButton.leaveEvent = iconButton.connect( "leave-event", () => {
            iconButton.focus = false; iconButton.icon.icon_name = iconNameURI; return Clutter.EVENT_STOP
        } )
        iconButton.enterEvent = iconButton.connect( "enter-event", () => {
            if ( alternateIconName ) iconButton.icon.icon_name = alternateIconName; return Clutter.EVENT_STOP
        } )
        iconButton.pressEvent = iconButton.connect( "button-press-event", () => { iconButton.focus = true; return Clutter.EVENT_STOP } )
        iconButton.releaseEvent = iconButton.connect( "button-release-event", () => {
            if ( iconButton.focus == true ) callback(); return Clutter.EVENT_STOP
        } )
        parentItem.iconsButtonsPressIds.push( [iconButton.pressEvent,
            iconButton.releaseEvent,
            iconButton.leaveEvent] )
        parentItem.destroyIconButtons = function () {
            parentItem.iconButtons.forEach( function ( iconButton ) {
                //iconButton.destroy();
            }, this )
            parentItem.iconButtons = []
            parentItem.iconsButtonsPressIds = []
        }
        return iconButton
    } catch ( e ) { dev.log( e ) }
}

// Notifications - Gnome Notification - Or a Tooltip that overlays the screen
export let messages = []
export function showUserNotification( input, overviewMessage = false, fadeTime = 2.9 ) {
    dev.log( "Notification", input )
    removeAllUserNotifications()

    if ( overviewMessage ) {
        Main.overview.setMessage( _( input ), { forFeedback: true } )
        return null
    }
    const label = new St.Label( { style_class: "feedback-label", text: _( input ) } )
    messages.push( label )
    let lastItem = messages.length - 1
    Main.uiGroup.add_child( messages[lastItem] )
    messages[lastItem].opacity = 255
    let monitor = Main.layoutManager.primaryMonitor
    messages[lastItem].set_position(
        monitor.x +
            Math.floor( monitor.width / 2 - messages[lastItem].width / 2 ),
        monitor.y +
            Math.floor( monitor.height / 2 - messages[lastItem].height / 2 )
    )
    if ( fadeTime > 0 ) removeUserNotification( label, fadeTime )

    return label
}

export function removeUserNotification( label, fadeTime ) {
    if ( !label ) return
    if ( !fadeTime ) {
        Main.uiGroup.remove_child( label )
        messages = messages.filter( item => item != label )
        if ( label.attachedTo ) label.attachedTo.notificationLabel = null
        label = null
    } else {
        label.ease( {
            opacity    : 0,
            time       : fadeTime || 1.4,
            transition : "easeOutQuad",
            onComplete : () => {
                Main.uiGroup.remove_child( label )
                messages = messages.filter( item => item != label )
                if ( label.attachedTo ) label.attachedTo.notificationLabel = null
                label = null
            }
        } )
    }
}
export function removeAllUserNotifications( fadeTime ) {
    messages.forEach( function ( message, i ) {
        removeUserNotification( message, fadeTime )
    }, this )
}

export function createTooltip( widget, tooltip ) {
    try {
        if ( !tooltip ) return
        widget.tooltip = tooltip

        if ( widget.tooltipEnterEvent ) widget.disconnect( widget.tooltipEnterEvent )
        if ( widget.tooltipLeaveEvent ) widget.disconnect( widget.tooltipLeaveEvent )
        if ( widget.tooltipPressEvent ) widget.disconnect( widget.tooltipPressEvent )
        if ( widget.notificationLabel ) {
            removeUserNotification( widget.notificationLabel, 0.1 )
            widget.notificationLabel = false
            widget.hovering = false
        }

        widget.tooltipEnterEvent = widget.connect( "enter_event", () => {
            widget.hovering = true
            Me.session.signals.add( GLib.timeout_add( null, widget.tooltip.delay || 700, () => {
                // Ensure there is only one notification per widget
                if ( widget.notificationLabel ) return
                // Create message
                if ( widget.hovering && !widget.notificationLabel && ( Me.session.activeSession.Options.ShowHelpers || widget.tooltip.force ) ) {
                    widget.notificationLabel = showUserNotification(
                        widget.tooltip.msg, widget.tooltip.overviewMessage || false, widget.tooltip.fadeTime || 0
                    )
                    widget.notificationLabel.attachedTo = widget
                }
                // Make sure they're eventually removed for any missed cases
                Me.session.signals.add( GLib.timeout_add( null, widget.tooltip.disappearTime || 4000, () => {
                    if ( widget.notificationLabel )
                        removeUserNotification( widget.notificationLabel, 1 )
                    return false
                } ) )
                return false
            } ) )

            //return Clutter.EVENT_STOP;
        } )
        widget.tooltipLeaveEvent = widget.connect( "leave_event", () => {
            widget.hovering = false
            if ( widget.notificationLabel )
                removeUserNotification( widget.notificationLabel, widget.tooltip.leaveFadeTime || 1.4 )
            //return Clutter.EVENT_STOP;
        } )

        widget.tooltipPressEvent = widget.connect( "button-press-event", () => {
            widget.hovering = false
            widget.notificationLabel && removeUserNotification( widget.notificationLabel, 0.7 )
        } )
        if ( widget instanceof popupMenu.PopupSwitchMenuItem )
            widget.connect( "toggled", () => {
                widget.hovering = false
                widget.notificationLabel && removeUserNotification( widget.notificationLabel, 0.7 )
            } )
    } catch ( e ) { dev.log( e ) }
}

export let knownImages = {} // Save on resources generating these in menu refreshes
export function setImage( parent, imgFilePath = "" ) {
    try {
        let error
        let image
        imgFilePath = imgFilePath.replace( "file://", "" )

        if ( knownImages[imgFilePath] ) {
            image = knownImages[imgFilePath]
        } else if ( imgFilePath ) {
            let pixbuf
            try {
                pixbuf = GdkPixbuf.Pixbuf.new_from_file( imgFilePath )
            } catch ( e ) {
                dev.log( e )
                // if ( e instanceof GLib.FileError )
                // not a valid image file - sometimes it's set to an .xml slideshow file
                return [null, e]
            }
            if ( pixbuf === null ) // file doesnt exist
                return [( imgFilePath = "" ), new Error( "Null pixbuf" )]

            const { width, height } = pixbuf
            if ( height == 0 ) return

            const coglContext = global.stage.context.get_backend().get_cogl_context()
            image = new St.ImageContent()
            let success = image.set_data(
                coglContext,
                pixbuf.get_pixels(),
                pixbuf.get_has_alpha()
                    ? Cogl.PixelFormat.RGBA_8888
                    : Cogl.PixelFormat.RGB_888,
                width,
                height,
                pixbuf.get_rowstride()
            )
            if ( !success ) throw Error( "error creating Clutter.Image()" )
        } else { // empty image if no file path
            image = new St.ImageContent()
        }
        parent.imgSrc = imgFilePath
        parent.content = image
        parent.height = 150

        knownImages[imgFilePath] = image
        return [image, error]
    } catch ( e ) { dev.log( e ) }
}

