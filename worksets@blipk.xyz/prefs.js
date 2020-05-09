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

// External imports
const { GLib, Gtk, Meta } = imports.gi;
const { extensionUtils } = imports.misc;

// Internal imports
const Me = extensionUtils.getCurrentExtension();
const { dev, prefsActions } = Me.imports;

function init () {
    sessionsObject = Me.imports.fileUtils.loadJSObjectFromFile('session.json', Me.imports.fileUtils.CONF_DIR);
    sessionsObject.Options.ShowPanelIndicator = true;
    let sessionCopy = JSON.parse(JSON.stringify(sessionsObject));
    Me.imports.fileUtils.saveJSObjectToFile(sessionsObject, 'session.json', Me.imports.fileUtils.CONF_DIR);

    prefsActions.restart();
}

function buildPrefsWidget() {
    let prefsWidget = new Gtk.Label({label: 'Done',  visible: true });

    GLib.timeout_add(0, null, () => {
                 let window = prefsWidget.get_toplevel();
                 let hb = window.get_titlebar();
                 hb.title = `${Me.metadata.name} Preferences`;
             });
    
    return prefsWidget;
}