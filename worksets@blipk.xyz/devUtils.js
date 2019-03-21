/*
 * Worksets extension for Gnome 3
 * This file is part of the worksets extension for Gnome 3
 * Copyright (C) 2019 A.D. - http://blipk.xyz
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope this it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * 
 * Credits:
 * This extension was created by using the following gnome-shell extensions
 * as a source for code and/or a learning resource
 * - dash-to-panel@jderose9.github.com.v16.shell-extension
 * - clipboard-indicator@tudmotu.com
 * - workspaces-to-dock@passingthru67.gmail.com
 * - workspace-isolated-dash@n-yuki.v14.shell-extension
 * - historymanager-prefix-search@sustmidown.centrum.cz
 * - minimum-workspaces@philbot9.github.com.v9.shell-extension
 * 
 * Many thanks to those great extensions.
 */


//Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const fileUtils = Me.imports.fileUtils;
const utils = Me.imports.utils;
const _debug_ = true;
const scopeName = "devUtils";

function printJSON(object) {
    return JSON.stringify(object, null, 2);
}
function log(context, message) {
    if (!_debug_) return;

    if (message === undefined) {message = context; context = "()=>";}
    if (message === undefined) {message = "UNDEFINED object"}
    if (message === null) {message = "NULL value"}

    let timestamp = new Date().toLocaleString();
    let prefix = timestamp + '  -  ' + Me.uuid.toString() + " | ";
    let out = prefix;

    if (message instanceof Error) {
        out += "!ERROR!   |- " + context.toString() + " | " + '\r\n' + "|-" + message.name +" "+ message.message + '\r\n' + "|-Stack Trace:" + '\r\n' + message.stack + '\r\n';
    } else if (typeof message === 'object') {
        out += "OBJLog    |- " + context.toString() + " | " + message.toString() + '\r\n';
        out += printJSON(message) + '\r\n\r\n';
    } else {
        out += "DebugInfo |- " + context.toString() + " | " + message.toString() + '\r\n';
    }

    global.log(out);
    fileUtils.saveRawToFile(out, 'debug.log', fileUtils.CONF_DIR, true);
}