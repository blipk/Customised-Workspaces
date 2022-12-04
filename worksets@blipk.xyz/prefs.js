/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) 2023 A.D. - http://kronosoul.xyz
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
const { GLib, Gtk } = imports.gi;
const { extensionUtils } = imports.misc;

// Internal imports
const Me = extensionUtils.getCurrentExtension();
const { dev } = Me.imports;

function init() {
    Me.settings = extensionUtils.getSettings('org.gnome.shell.extensions.worksets');
    Me.settings.set_boolean('show-panel-indicator', false);
    Me.settings.set_boolean('show-panel-indicator', true);
}

function buildPrefsWidget() {
    let prefsWidget = new Gtk.Label({label: 'Panel indicator menu has been enabled. \r\nPreferences, settings and options are accessible from there.',  visible: true });

    if (!prefsWidget.get_toplevel) return prefsWidget;
    GLib.timeout_add(0, null, () => {
        let window = prefsWidget.get_toplevel();
        let hb = window.get_titlebar();
        hb.title = `${Me.metadata.name} Preferences`;
    });
    return prefsWidget;
}