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
 *
 * Credits:
 * This extension was created by using the following gnome-shell extensions
 * as a learning resource:
 * - dash-to-panel@jderose9.github.com.v16.shell-extension
 * - clipboard-indicator@tudmotu.com
 * - workspaces-to-dock@passingthru67.gmail.com
 * - workspace-isolated-dash@n-yuki.v14.shell-extension
 * - historymanager-prefix-search@sustmidown.centrum.cz
 * - minimum-workspaces@philbot9.github.com.v9.shell-extension
 * - gsconnect@andyholmes.github.io
 * Many thanks to those great extensions.
 */

// External imports
const Main = imports.ui.main;
const ExtensionSystem = imports.ui.extensionSystem;
const { extensionUtils, config } = imports.misc;
const { Meta, GLib, Gio, Shell } = imports.gi;
const [major] = config.PACKAGE_VERSION.split('.');
const shellVersion = Number.parseInt(major);

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const { dev, utils, uiUtils } = Me.imports;
const { panelIndicator, workspaceManager, workspaceView, sessionManager } = Me.imports;
const scopeName = "cw-shell-extension";

function init() {
    extensionUtils.initTranslations();
    dev.log(scopeName+'.'+arguments.callee.name, "@```````````````````````````````````|");
}

function enable() {
    try {
    dev.log(scopeName+'.'+arguments.callee.name, "@---------------------------------|");
    if (Me.session) return; // Already initialized
    global.shellVersion = shellVersion;

    // Maintain compatibility with GNOME-Shell 3.30+ as well as previous versions.
    Me.gScreen = global.screen || global.display;
    Me.gWorkspaceManager = global.screen || global.workspace_manager;
    Me.gMonitorManager = global.screen || utils.getMonitorManager();
    Me.gExtensionManager = (uuid)=>{var x = (extensionUtils.extensions)
                                            ? extensionUtils.extensions[uuid].imports.extension || 0
                                            : Main.extensionManager.lookup(uuid) || 0;
                                    return x};

    // To tune behaviour based on other extensions
    Me.gExtensions = new Object();
    Me.gExtensions.dash2panel = Me.gExtensionManager('dash-to-panel@jderose9.github.com');
    Me.gExtensions.dash2dock = Me.gExtensionManager('dash-to-dock@micxgx.gmail.com');

    if (ExtensionSystem.connect) Me.extensionChangedHandler = ExtensionSystem.connect('extension-state-changed', enable);
    Me.settings = extensionUtils.getSettings('org.gnome.shell.extensions.worksets');

    // Spawn session
    Me.session = new sessionManager.SessionManager();

    dev.log(scopeName+'.'+arguments.callee.name, "@~................................|");
    } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }
}
function disable() {
    try {
    dev.log(scopeName+'.'+arguments.callee.name, "!~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|");

    Me.session.saveSession();
    if (Me.worksetsIndicator) Me.worksetsIndicator.destroy(); delete Me.worksetsIndicator; delete Main.panel.statusArea['WorksetsIndicator'];
    if (Me.workspaceIsolater) Me.workspaceIsolater.destroy(); delete Me.workspaceIsolater;
    if (Me.workspaceManager) Me.workspaceManager.destroy(); delete Me.workspaceManager;
    if (Me.workspaceViewManager) Me.workspaceViewManager.destroy(); delete Me.workspaceViewManager;
    if (Me.session) Me.session.destroy(); delete Me.session;
    if (Me.settings) Me.settings.run_dispose(); delete Me.settings;
    if (Me.extensionChangedHandler) ExtensionSystem.disconnect(extensionChangedHandler);

    dev.log(scopeName+'.'+arguments.callee.name, "!^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^|"+'\r\n');
    } catch(e) { dev.log(scopeName+'.'+arguments.callee.name, e); }

}

// 3.0 API backward compatibility
function main() {
    init();
    enable();
}