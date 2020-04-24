/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) 2020 A.D. - http://kronosoul.xyz
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

// External imports
const AppIcon = imports.ui.appDisplay.AppIcon;
const Main = imports.ui.main;
const Gettext = imports.gettext;
const { GObject, Meta, Shell } = imports.gi;
const AppSystem = Shell.AppSystem.get_default();

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const dev = Me.imports.devUtils;

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