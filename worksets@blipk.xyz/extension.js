/*
 * Worksets extension for Gnome 3
 * This file is part of the worksets extension for Gnome 3
 * Copyright 2019 Anthony D - blipk.xyz
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

//External imports
const ExtensionSystem = imports.ui.extensionSystem;
const ExtensionUtils = imports.misc.extensionUtils;
const FileUtils = imports.misc.fileUtils;
const Gettext = imports.gettext;
const Main = imports.ui.main;
const _ = Gettext.domain('worksets').gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();

//Internal imports
const Convenience = Me.imports.convenience;
const utils = Me.imports.utils;
const fileUtils = Me.imports.fileUtils;
const uiUtils = Me.imports.uiUtils;
const panelIndicator = Me.imports.panelIndicator;
const workspaceManager = Me.imports.workspaceManager;
const sessionManager = Me.imports.sessionManager;
const debug = Me.imports.devUtils;
const scopeName = "worksetsalphaextension";

const Gio = imports.gi.Gio;
const GioSSS = Gio.SettingsSchemaSource;

let extensionChangedHandler;
function init() {
    debug.log(scopeName+'.'+arguments.callee.name, "Initialization point.........");
    Convenience.initTranslations();
}

function enable() {
    try {
    if (Me.session) return; //already initialized
    debug.log(scopeName+'.'+arguments.callee.name, "Enable point.........");

    // Maintain compatibility with GNOME-Shell 3.30+ as well as previous versions.
    Me.gScreen = global.screen || global.display;
    Me.gWorkspaceManager = global.screen || global.workspace_manager;
    Me.gMonitorManager = global.screen || Meta.MonitorManager.get();

    extensionChangedHandler = ExtensionSystem.connect('extension-state-changed', enable);
    Me.settings = Convenience.getSettings('org.gnome.shell.extensions.worksets');

    //Spawn session
    Me.session = new sessionManager.sessionManager();
    } catch(e) { debug.log(scopeName+'.'+arguments.callee.name, e); }
}
function disable() {
    debug.log(scopeName+'.'+arguments.callee.name, "Shutting down extension...");
    try {
    if (Me.worksetsIndicator) Me.worksetsIndicator.destroy(); delete Me.worksetsIndicator; delete Main.panel.statusArea['WorksetsIndicator']; //This role wasn't being removed when the above is destroyed/deleted causing the extension to only be enabled once per gnome-shell session and would cause endless loops and hangs if enabled on shell startup 
    if (Me.workspaceManager) Me.workspaceManager.destroy(); delete Me.workspaceManager;
    if (Me.session) Me.session.destroy(); delete Me.session;
    if (Me.settings) Me.settings.run_dispose(); delete Me.settings;
    if (extensionChangedHandler) ExtensionSystem.disconnect(extensionChangedHandler); delete extensionChangedHandler;
    } catch(e) { debug.log(scopeName+'.'+arguments.callee.name, e); }
    debug.log(scopeName+'.'+arguments.callee.name, "Extension destroyed!"+'\r\n');
}

// 3.0 API backward compatibility
function main() {
    init();
    enable();
}