/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) http://github.com/blipk
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

/*
 * Compatibility helpers for the GNOME Shell versions in metadata.json.
 * Put each difference between GNOME Shell versions here, so that the other modules do not
 * need their own version checks.
 */

// External imports
import Clutter from "gi://Clutter"
import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as Config from "resource:///org/gnome/shell/misc/config.js"
import * as boxpointer from "resource:///org/gnome/shell/ui/boxpointer.js"
import * as workspaceAnimation from "resource:///org/gnome/shell/ui/workspaceAnimation.js"
import { ExtensionState } from "resource:///org/gnome/shell/misc/extensionUtils.js"

/** First GNOME Shell version without Meta.Background.set_file(). Wallpapers must be loaded into textures. */
const BACKGROUND_TEXTURES_SHELL_VERSION = 51
/** First GNOME Shell version where PopupMenu.open(), close() and itemActivated() take a params object. */
const MENU_PARAMS_SHELL_VERSION = 51
/** First GNOME Shell version where St.BoxLayout has the orientation property instead of vertical. */
const BOX_ORIENTATION_SHELL_VERSION = 48
/** First GNOME Shell version where St.ImageContent.set_data() takes a Cogl.Context as its first argument. */
const IMAGE_CONTEXT_SHELL_VERSION = 48

/** Major version of the GNOME Shell that runs the extension, for example 51 for "51.1". */
export const SHELL_MAJOR_VERSION = Number.parseInt( Config.PACKAGE_VERSION.split( "." )[0], 10 )

/** True when wallpapers must be decoded into a texture for Meta.Background.set_texture(). */
export const needsBackgroundTextures = SHELL_MAJOR_VERSION >= BACKGROUND_TEXTURES_SHELL_VERSION

/**
 * Makes the St.BoxLayout constructor properties for a vertical box.
 * GNOME Shell 47 and earlier take { vertical }. GNOME Shell 48 and later take { orientation }.
 * @returns {object} The properties for the GNOME Shell version that runs the extension
 */
export const verticalBox = () => SHELL_MAJOR_VERSION >= BOX_ORIENTATION_SHELL_VERSION
    ? { orientation: Clutter.Orientation.VERTICAL }
    : { vertical: true }

/**
 * Calls St.ImageContent.set_data() with the arguments for the GNOME Shell version that runs the extension.
 * GNOME Shell 47 and earlier inherit it from Clutter.Image, without the Cogl.Context argument.
 * @param {St.ImageContent} image - The image content
 * @param {...*} args - The pixels, pixel format, width, height and rowstride
 * @returns {boolean} True if the data was set
 */
export const setImageData = ( image, ...args ) => {
    if ( SHELL_MAJOR_VERSION < IMAGE_CONTEXT_SHELL_VERSION ) return image.set_data( ...args )
    const coglContext = global.stage.context.get_backend().get_cogl_context()
    return image.set_data( coglContext, ...args )
}

/**
 * Name of the first workspaceAnimation.WorkspaceGroup method that has the workspace and the background.
 * GNOME Shell 47 and earlier make the background in _init(), later versions in _createBackground().
 */
export const workspaceGroupBackgroundMethod = workspaceAnimation.WorkspaceGroup.prototype._createBackground
    ? "_createBackground"
    : "_init"

/**
 * Makes the animation argument for PopupMenu.open(), PopupMenu.close() and PopupMenuBase.itemActivated().
 * GNOME Shell 50 and earlier take a BoxPointer.PopupAnimation value. GNOME Shell 51 and later take { animate }.
 * @param {boolean} [animate=true] - True for the full animation, false for no animation
 * @returns {number|{animate: boolean}} The argument for the GNOME Shell version that runs the extension
 */
export const menuAnimation = ( animate = true ) => {
    if ( SHELL_MAJOR_VERSION >= MENU_PARAMS_SHELL_VERSION ) return { animate }
    return animate ? boxpointer.PopupAnimation.FULL : boxpointer.PopupAnimation.NONE
}

/**
 * Finds out if an extension is enabled and running.
 * Extension.lookupByUUID() gives the extension object, which has no state, thus this uses the extension manager.
 * ExtensionState.ACTIVE replaced ExtensionState.ENABLED before GNOME Shell 49.
 * @param {string} uuid - UUID of the extension
 * @returns {boolean} True if the extension is active
 */
export const isExtensionActive = ( uuid ) => Main.extensionManager.lookup( uuid )?.state === ExtensionState.ACTIVE
