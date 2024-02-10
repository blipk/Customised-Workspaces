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
import * as Main from 'resource:///org/gnome/shell/ui/main.js';;
import * as workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as workspaceAnimation from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import * as workspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as workspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';
import * as popupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as background from 'resource:///org/gnome/shell/ui/background.js';
import * as layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as overview from 'resource:///org/gnome/shell/ui/overview.js';
import * as overviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';;
import GObject from 'gi://GObject'
import Meta from 'gi://Meta'
import Shell from 'gi://Shell'
import GLib from 'gi://GLib'
import St from 'gi://St'
import Clutter from 'gi://Clutter'
import Gtk from 'gi://Gtk'
import Gio from 'gi://Gio';

// Internal imports
import { WorksetsInstance as Me } from './extension.js';
import * as dev from './dev.js';
import * as utils from './utils.js';
import * as uiUtils from './uiUtils.js';
import * as sessionManager from './sessionManager.js';

export class WorkspaceViewManager {
    constructor() {
        try {
            Me.workspaceViewManager = this
            this.injections = new utils.InjectionHandler()
            this.signals = new utils.SignalHandler()
            this.menus = []

            this.thumbnailsBox = null
            this.thumbnailBoxes = []
            this.overviewControls = null
            this.gsWorkspaces = {}
            this.wsvWorkspaces = {}
            this.wsGroups = {}
            this.overviewState = 0

            // Keep track of the new workspace views so their background can be changed in refreshOverview()
            this.injections.add('workspace.Workspace.prototype._init',
                function (metaWorkspace, monitorIndex, overviewAdjustment) {
                    Me.workspaceViewManager.injections.injections['workspace.Workspace.prototype._init']
                        .call(this, metaWorkspace, monitorIndex, overviewAdjustment);
                    Me.workspaceViewManager.gsWorkspaces[metaWorkspace] = this;
                    this.connect('destroy', () => delete Me.workspaceViewManager.gsWorkspaces[metaWorkspace]);
                });

            // Extra reference to workspace views in overview
            this.injections.add('workspacesView.WorkspacesView.prototype._init',
                function (monitorIndex, controls, scrollAdjustment, fitModeAdjustment, overviewAdjustment) {
                    Me.workspaceViewManager.injections.injections['workspacesView.WorkspacesView.prototype._init']
                        .call(this, monitorIndex, controls, scrollAdjustment, fitModeAdjustment, overviewAdjustment);
                    Me.workspaceViewManager.wsvWorkspaces = this._workspaces;
                    this.connect('destroy', () => delete Me.workspaceViewManager.wsvWorkspaces);
                });

            // For gestures from desktop
            this.injections.add('workspaceAnimation.WorkspaceGroup.prototype._init',
                function (workspace, monitor, movingWindow) {
                    Me.workspaceViewManager.injections.injections['workspaceAnimation.WorkspaceGroup.prototype._init']
                        .call(this, workspace, monitor, movingWindow);
                    if (!workspace)
                        return
                    Me.workspaceViewManager.wsGroups[workspace] = this;
                    Me.workspaceViewManager.refreshDesktop();
                    this.connect('destroy', () => delete Me.workspaceViewManager.wsGroups[workspace]);
                });

            this.injections.add('overviewControls.ControlsManager.prototype._init',
                function () {
                    Me.workspaceViewManager.injections.injections['overviewControls.ControlsManager.prototype._init']
                        .call(this);
                    Me.workspaceViewManager.overviewControls = this;
                    Me.workspaceViewManager.thumbnailsBox = this._thumbnailsBox;
                });

            this.injections.add('workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails',
                function (start, count) {
                    Me.workspaceViewManager.injections.injections['workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails']
                        .call(this, start, count);
                    this.connect('destroy', () => {
                        if (this._bgManager) { this._bgManager.destroy(); this._bgManager = null; }
                    });
                    Me.workspaceViewManager.thumbnailsBox = this;
                    Me.workspaceViewManager.thumbnailBoxes = this._thumbnails;
                    Me.workspaceViewManager.refreshOverview();
                });

            // Re-implementation from earlier shell versions to show the desktop background in the workspace thumbnail
            this.injections.add('workspaceThumbnail.ThumbnailsBox.prototype._addWindowClone',
                function (win) {
                    let clone = new workspaceThumbnail.ThumbnailsBox.WindowClone(win);
                    clone.connect('selected', (o, time) => { this.activate(time); });
                    clone.connect('drag-begin', () => { Main.overview.beginWindowDrag(clone.metaWindow); });
                    clone.connect('drag-cancelled', () => { Main.overview.cancelledWindowDrag(clone.metaWindow); });
                    clone.connect('drag-end', () => { Main.overview.endWindowDrag(clone.metaWindow); });
                    clone.connect('destroy', () => { this._removeWindowClone(clone.metaWindow); });
                    this._contents.add_actor(clone);
                    if (this._windows.length == 0) clone.setStackAbove(this._bgManager.backgroundActor);
                    else clone.setStackAbove(this._windows[this._windows.length - 1]);
                    this._windows.push(clone);
                    return clone;
                });

            // Delete all the extra background managers when the overview is hidden so the desktop is set correctly
            /* hidden, hiding, showing */
            this.signals.add(Main.overview, 'hidden', function () {
                Me.workspaceViewManager.thumbnailBoxes.forEach(function (thumbnailBox, i) {
                    try {
                        if (thumbnailBox._bgManager)
                            thumbnailBox._bgManager.destroy();
                        if (Me.workspaceManager.activeWorkspaceIndex != i) return;
                    } catch (e) { dev.log(e) }
                });
            });

            // Run the correct overlay update when the state adjustment hits values in overviewControls.ControlsState
            Main.overview._overview._controls._stateAdjustment.connect('notify::value', (adjustment) => {
                const value = adjustment.value
                const valueDecimal = parseFloat("0." + (value + "").split(".")[1], 10)
                const intValue = parseInt(adjustment.value, 10)

                if (!adjustment.lastValue)
                    adjustment.lastValue = -1
                const ascending = value > adjustment.lastValue
                adjustment.lastValue = Number(value)

                if (value > 1 && value < 2) {
                    if (ascending) { // Entering into AppGrid overview
                        if (valueDecimal > 0.3) return
                        Me.workspaceViewManager.refreshOverview(2);
                    } else {
                        if (valueDecimal < 0.7) return
                        Me.workspaceViewManager.refreshOverview(2);
                    }
                    return
                } else if (value > intValue)
                    return

                Me.workspaceViewManager.refreshOverview(intValue);
            });
            // This is needed in addition to above to ensure the correct starting overlay state with gestures
            this.injections.add('overviewControls.ControlsManager.prototype.gestureBegin',
                function (tracker) {
                    Me.workspaceViewManager.injections.injections["overviewControls.ControlsManager.prototype.gestureBegin"]
                        .call(this, tracker);
                    Me.workspaceViewManager.refreshOverview(2);
                });

        } catch (e) { dev.log(e) }
    }

    destroy() {
        try {
            this.injections.removeAll();
            this.signals.disconnectAll();

            delete this.injections;
            delete this.signals;
        } catch (e) { dev.log(e) }
    }

    refreshThumbnailBoxes() {
        try {
            if (this.thumbnailsBox) this.thumbnailsBox.addThumbnails()
            this.refreshOverview()
        } catch (e) { dev.log(e) }
    }

    makeWorksetBg(workset) {
        try {
            const newbg = new Meta.Background({ meta_display: Me.gScreen });
            workset = workset || Me.session.DefaultWorkset;
            const bgPath = Me.session.isDarkMode
                ? workset.BackgroundImageDark.replace("file://", "")
                : workset.BackgroundImage.replace("file://", "");
            const backgroundStyle = Me.session.isDarkMode
                ? workset.BackgroundStyleDark.toUpperCase()
                : workset.BackgroundStyle.toUpperCase()
            newbg.set_file(
                Gio.file_new_for_path(bgPath),
                imports.gi.GDesktopEnums.BackgroundStyle[backgroundStyle] || imports.gi.GDesktopEnums.BackgroundStyle.ZOOM
            );
            return newbg
        } catch (e) { dev.log(e) }
    }

    refreshDesktop() {
        try {
            if (Me.session.activeSession.Options.DisableWallpaperManagement)
                return

            for (const i in this.wsGroups) {
                const wsGroup = this.wsGroups[i]
                const metaWorkspace = wsGroup.workspace
                wsGroup._workset = Me.session.Worksets
                    .find((wset) => wset.WorksetName == Me.session.workspaceMaps['Workspace' + metaWorkspace.index()].currentWorkset)

                if (wsGroup._newbg)
                    delete wsGroup._newbg
                wsGroup._newbg = this.makeWorksetBg(wsGroup._workset)

                // For thumbnails on the overview
                if (wsGroup._bgManager)
                    wsGroup._bgManager.destroy();

                wsGroup._bgManager = new background.BackgroundManager({
                    monitorIndex: wsGroup._monitor.index,
                    container: wsGroup._background,
                    //layoutManager: Main.layoutManager,
                    controlPosition: false,
                    vignette: false,
                })
                wsGroup._bgManager.backgroundActor.content.set({
                    background: wsGroup._newbg,
                    vignette: false,
                    vignette_sharpness: 0.5,
                    brightness: 0.5,
                })
            }
        } catch (e) { dev.log(e) }
    }

    refreshOverview(overviewState = overviewControls.ControlsState.WINDOW_PICKER) {
        try {
            if (!Main.overview._visible) return;

            for (const i in this.thumbnailBoxes) {
                const thumbnailBox = this.thumbnailBoxes[i]
                let gsWorkspace = this.gsWorkspaces[thumbnailBox.metaWorkspace];
                if (!gsWorkspace)
                    continue //dev.log("No gsWorkspace for thumbnail")

                // Find active workset for thumbnailbox
                thumbnailBox._workset = Me.session.Worksets
                    .find((wset) => wset.WorksetName == Me.session.workspaceMaps['Workspace' + i].currentWorkset)
                //  || Me.session.DefaultWorkset

                //if (Me.session.workspaceMaps['Workspace'+i].currentWorkset != thumbnailBox._workset.WorksetName
                //&& Me.session.workspaceMaps['Workspace'+i].currentWorkset != "")
                //continue;

                // New background for thumbnail box
                if (thumbnailBox._newbg)
                    delete thumbnailBox._newbg
                thumbnailBox._newbg = this.makeWorksetBg(thumbnailBox._workset)

                // For larger workspace view and app grid workspace preview
                if (gsWorkspace)
                    gsWorkspace._background._bgManager.backgroundActor.content.background = thumbnailBox._newbg;

                if (Me.session.activeSession.Options.DisableWallpaperManagement) {
                    this.updateOverlay(overviewState, thumbnailBox, i)
                    continue
                }

                // For larger workspace view and app grid workspace preview
                gsWorkspace._background._bgManager.backgroundActor.content.background = thumbnailBox._newbg;

                // For thumbnails on the overview
                if (thumbnailBox._bgManager)
                    thumbnailBox._bgManager.destroy();

                thumbnailBox._bgManager = new background.BackgroundManager({
                    monitorIndex: Main.layoutManager.primaryIndex,
                    container: thumbnailBox._contents,
                    //layoutManager: Main.layoutManager,
                    controlPosition: false,
                    vignette: false,
                })
                thumbnailBox._bgManager.backgroundActor.content.set({
                    background: thumbnailBox._newbg,
                    vignette: false,
                    vignette_sharpness: 0.5,
                    brightness: 0.5,
                })

                // Prevent excessive recursion but enforce background updates during various events
                thumbnailBox._updated = false;
                thumbnailBox._bgManager.connect('changed', () => { if (!thumbnailBox._updated) Me.workspaceViewManager.refreshOverview(); thumbnailBox._updated = true; });

                this.updateOverlay(overviewState, thumbnailBox._workset, i)
            }

        } catch (e) { dev.log(e) }
    }

    updateOverlay(overviewState, workset, i) {
        try {
            // Delete old overlay box and rebuild
            if (this.wsvWorkspaces[i]._worksetOverlayBox) {
                this.wsvWorkspaces[i]._worksetOverlayBox.destroy_all_children();
                this.wsvWorkspaces[i]._worksetOverlayBox.destroy();
            }

            // Stop after background change if overlay box is not enabled
            // dev.log(Main.overview._overview._controls._appDisplay.visible)
            if (!Me.session.activeSession.Options.ShowWorkspaceOverlay)
                return;

            // Global box
            this.wsvWorkspaces[i]._worksetOverlayBox = new St.BoxLayout({
                style_class: 'workspace-overlay',
                x_align: Clutter.ActorAlign.FILL, x_expand: true,
                y_align: Clutter.ActorAlign.FILL, y_expand: true,
            });
            this.wsvWorkspaces[i].add_child(this.wsvWorkspaces[i]._worksetOverlayBox);

            // Label text
            let worksetLabel = new St.Label({
                style_class: 'workset-label',
                x_align: Clutter.ActorAlign.START, x_expand: true,
                y_align: Clutter.ActorAlign.START, y_expand: true,
            });
            let text = '';
            if (Me.session.workspaceMaps['Workspace' + i] != undefined)
                text = Me.session.workspaceMaps['Workspace' + i].currentWorkset;
            worksetLabel.set_text(text);
            this.wsvWorkspaces[i]._worksetOverlayBox.add_child(worksetLabel)

            if (overviewState >= overviewControls.ControlsState.APP_GRID)
                return

            // Icon buttons
            let iconsBox = new St.BoxLayout({
                x_align: Clutter.ActorAlign.END, x_expand: true,
                y_align: Clutter.ActorAlign.START, y_expand: false,
            });
            this.wsvWorkspaces[i]._worksetOverlayBox.add_child(iconsBox);

            let icon_options = {
                style_class: "overlay-icon", icon_size: 24
            };

            // Button to access panel menu, if it is disabled
            if (!Me.session.activeSession.Options.ShowPanelIndicator)
                uiUtils.createIconButton(iconsBox, 'emblem-system-symbolic', () => {
                    Me.session.activeSession.Options.ShowPanelIndicator ? Me.worksetsIndicator.toggleMenu() : null;
                    Me.session.activeSession.Options.ShowPanelIndicator = true;
                    Me.session.applySession();
                }, icon_options, { msg: "Customised Workspaces options menu" })

            // Action buttons for custom workspaces
            if (workset) {
                uiUtils.createIconButton(iconsBox, 'document-edit-symbolic', () => { Me.session.editWorkset(workset); }, icon_options, { msg: "Edit '" + workset.WorksetName + "'" });
                uiUtils.createIconButton(iconsBox, 'image-x-generic-symbolic', () => { Me.session.setWorksetBackgroundImage(workset, Me.session.isDarkMode); }, icon_options, { msg: "Change the background for '" + workset.WorksetName + "'" })
                uiUtils.createIconButton(iconsBox, 'window-close-symbolic', () => { Me.session.closeWorkset(workset); Me.workspaceViewManager.refreshThumbnailBoxes(); }, icon_options, { msg: "Disengage '" + workset.WorksetName + "'" })
            }

            // Image for empty workspace thumbnail
            if (!workset /* && Me.workspaceManager.NumGlobalWorkspaces == i+1 */) {
                uiUtils.createIconButton(iconsBox, 'document-new-symbolic', () => {
                    Me.workspaceManager.switchToWorkspace(i); Me.session.newWorkset(null, true, true);
                }, icon_options, { msg: "Create new custom workspace here" });

                let btn = uiUtils.createIconButton(iconsBox, 'go-jump-symbolic', () => {
                    try {
                        if (btn.menu) return btn.menu.bye();

                        btn.menu = new popupMenu.PopupMenu(btn, Clutter.ActorAlign.START, St.Side.TOP);
                        this.menus.push(btn.menu)
                        btn.menu.bye = function () {
                            Main.uiGroup.remove_actor(btn.menu.actor);
                            btn.menu.actor.hide();
                            btn.menu.destroy();
                            btn.menu = null;
                            return true;
                        }

                        let menuItems = [];
                        let defaultMenuItem;
                        Me.session.Worksets.forEach(function (workset, ii) {
                            // Don't show active worksets
                            let activeIndex = Me.session.getWorksetActiveIndex(workset);
                            if (activeIndex > -1) return;

                            let menuItem = new popupMenu.PopupMenuItem('');
                            menuItems.push(menuItem);
                            if (workset.WorksetName == Me.session.DefaultWorkset.WorksetName) defaultMenuItem = menuItem;
                            menuItem._workset = workset;
                            menuItem.label.set_text(menuItem._workset.WorksetName);

                            menuItem.buttonPressId = menuItem.connect('button_release_event', () => {
                                Me.workspaceManager.loadDefaults = false;
                                Me.workspaceManager.noUpdate = true;
                                Me.workspaceManager.switchToWorkspace(i);
                                Me.session.displayWorkset(workset);
                                // Something is switching to the last workspace after this menu is destroyed
                                // This is my hack to make sure we stay on the right one
                                this.signals.add(GLib.timeout_add(null, 230, () => {
                                    Me.workspaceManager.switchToWorkspace(i);
                                    Me.workspaceManager.loadDefaults = true;
                                    Me.workspaceManager.noUpdate = false;
                                    Me.workspaceManager._workspaceUpdate();
                                    return false
                                }));
                                btn.menu.bye();
                            });

                            if (Me.session.activeSession.Default == menuItem._workset.WorksetName)
                                btn.menu.defaultItem = menuItem._workset.WorksetName

                            menuItem.setOrnament(popupMenu.Ornament.NONE);
                            btn.menu.addMenuItem(menuItem, 0);
                        }, this);

                        // Move the active workset to the top
                        if (!utils.isEmpty(defaultMenuItem)) {
                            btn.menu.moveMenuItem(defaultMenuItem, 0);
                            defaultMenuItem.setOrnament(popupMenu.Ornament.DOT);
                        }

                        // If no inactive worksets for the menu, add an option to create
                        if (menuItems.length == 0) {
                            let menuItem = new popupMenu.PopupMenuItem('');
                            menuItems.push(menuItem);
                            menuItem.label.set_text("Create New Workspace Here");
                            menuItem.buttonPressId = menuItem.connect('button-press-event', () => {
                                Me.workspaceManager.switchToWorkspace(i); Me.session.newWorkset(null, true, true);
                                btn.menu.bye();
                            });
                            menuItem.setOrnament(popupMenu.Ornament.NONE);
                            btn.menu.addMenuItem(menuItem, 0);
                        }

                        Main.uiGroup.add_actor(btn.menu.actor);
                        this.signals.add(GLib.timeout_add(null, 5000, () => { if (!utils.isEmpty(btn.menu)) btn.menu.bye(); return false }));
                        btn.menu.open();
                    } catch (e) { dev.log(e) }
                }, icon_options, { msg: "Choose a custom workspace to load here" });
                btn.connect('destroy', () => { if (btn.menu) btn.menu.bye(); });
            }
        } catch (e) { dev.log(e) }
    }
};