/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) 2020 A.D. - http://kronosoul.xyz
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

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { utils, fileUtils } = Me.imports;
const _debug_ = true;

function log(context, message) {
    if (!_debug_) return;
    if (message === undefined) {message = context; context = "() =>";}
    if (message === undefined) {message = "UNDEFINED value"}
    if (message === null) {message = "NULL value"}

    let timestamp = new Date().toLocaleString();
    let prefix =  '(' + Me.uuid.toString() + ') [' + timestamp + ']:';
    let out = prefix;

    if (message instanceof Error) {
        out += "!Error   | " + context.toString() + " | " + '\r\n' + "|-" + message.name +" "+ message.message + '\r\n' + "|-Stack Trace:" + '\r\n' + message.stack + '\r\n';
    } else if (typeof message === 'object') {
        out += "@Object  | " + context.toString() + " | " + message.toString() + '\r\n';
        out += JSON.stringify(message, null, 2) + '\r\n\r\n';
    } else {
        out += ":Info    | " + context.toString() + " | " + message.toString() + '\r\n';
    }

    global.log(out);
    fileUtils.saveRawToFile(out, 'debug.log', fileUtils.CONF_DIR, true);
}