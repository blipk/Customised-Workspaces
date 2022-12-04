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
const AppIcon = imports.ui.appDisplay.AppIcon;
const Main = imports.ui.main;
const { GObject, Meta, Shell } = imports.gi;
const AppSystem = Shell.AppSystem.get_default();

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const dev = Me.imports.dev;

//This removes running apps from workspaces they don't have any windows on when using standard gnome-shell dash
//Dash-to-panel and dash-to-dock have their own mechanisms for this, see panelIndicator._onIsolateSwitch()

// Credit to nyuki's extension workspace-isolated-dash@n-yuki.v14.shell-extension
var WorkspaceIsolator = class WorkspaceIsolator {
    constructor() {
        try {
        // Extend AppSystem to only return applications running on the active workspace
        AppSystem._workspace_isolated_dash_nyuki_get_running = AppSystem.get_running;
        AppSystem.get_running = function() {
            let running = AppSystem._workspace_isolated_dash_nyuki_get_running();
            if (Main.overview.visible)
                return running.filter(WorkspaceIsolator.isActiveApp);
            else
                return running;
        };
        // Extend App's activate to open a new window if no windows exist on the active workspace
        Shell.App.prototype._workspace_isolated_dash_nyuki_activate = Shell.App.prototype.activate;
        Shell.App.prototype.activate = function() {
            let activeWorkspace = Me.gWorkspaceManager.get_active_workspace();
            let windows = this.get_windows().filter(w => w.get_workspace().index() == activeWorkspace.index());

            if (windows.length > 0 &&
                (!(windows.length == 1 && windows[0].skip_taskbar) ||
                 this.is_on_workspace(activeWorkspace)))
                return Main.activateWindow(windows[0]);

            if (WorkspaceIsolator.isActiveApp(this))
                return this._workspace_isolated_dash_nyuki_activate();

            return this.open_new_window(-1);
        };
        // Extend AppIcon's state change to hide 'running' indicator for applications not on the active workspace
        AppIcon.prototype._workspace_isolated_dash_nyuki__updateRunningStyle = AppIcon.prototype._updateRunningStyle;
        AppIcon.prototype._updateRunningStyle = function() {
            if (WorkspaceIsolator.isActiveApp(this.app))
                this._workspace_isolated_dash_nyuki__updateRunningStyle();
            else
                this._dot.hide();
        };
        // Refresh when the workspace is switched
        this._onSwitchWorkspaceId = global.window_manager.connect('switch-workspace', WorkspaceIsolator.refresh);
        // Refresh whenever there is a restack, including:
        // - window moved to another workspace
        // - window created
        // - window closed
        this._onRestackedId = Me.gScreen.connect('restacked', WorkspaceIsolator.refresh);
        } catch(e) { dev.log(e) }
    }

    destroy() {
        // Revert the AppSystem function
        if (AppSystem._workspace_isolated_dash_nyuki_get_running) {
            AppSystem.get_running = AppSystem._workspace_isolated_dash_nyuki_get_running;
            delete AppSystem._workspace_isolated_dash_nyuki_get_running;
        }
        // Revert the App function
        if (Shell.App.prototype._workspace_isolated_dash_nyuki_activate) {
            Shell.App.prototype.activate = Shell.App.prototype._workspace_isolated_dash_nyuki_activate;
            delete Shell.App.prototype._workspace_isolated_dash_nyuki_activate;
        }
        // Revert the AppIcon function
        if (AppIcon.prototype._workspace_isolated_dash_nyuki__updateRunningStyle) {
            AppIcon.prototype._updateRunningStyle = AppIcon.prototype._workspace_isolated_dash_nyuki__updateRunningStyle;
            delete AppIcon.prototype._workspace_isolated_dash_nyuki__updateRunningStyle;
        }
        // Disconnect the restacked signal
        if (this._onRestackedId) {
            Me.gScreen.disconnect(this._onRestackedId);
            this._onRestackedId = 0;
        }
        // Disconnect the switch-workspace signal
        if (this._onSwitchWorkspaceId) {
            global.window_manager.disconnect(this._onSwitchWorkspaceId);
            this._onSwitchWorkspaceId = 0;
        }

        WorkspaceIsolator.refresh();
    }
};

// Check if an application is on the active workspace
WorkspaceIsolator.isActiveApp = function(app) {
    return app.is_on_workspace(Me.gWorkspaceManager.get_active_workspace());
};
// Refresh dash
WorkspaceIsolator.refresh = function() {
    // Update icon state of all running applications
    let running;
    if (AppSystem._workspace_isolated_dash_nyuki_get_running)
        running = AppSystem._workspace_isolated_dash_nyuki_get_running();
    else
        running = AppSystem.get_running();

    running.forEach(function(app) {
        app.notify('state');
    });

    // Update applications shown in the dash
    let dash = Main.overview._dash || Main.overview.dash;
    dash._queueRedisplay();
};