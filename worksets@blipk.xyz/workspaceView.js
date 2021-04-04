/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) 2021 A.D. - http://kronosoul.xyz
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
const Main = imports.ui.main;
const { workspace, workspacesView, workspaceThumbnail, popupMenu } = imports.ui;
const { GObject, Meta, Wnck, Shell, GLib, St, Clutter, Gtk, Gio } = imports.gi;
const Config = imports.misc.config;
const [major] = Config.PACKAGE_VERSION.split('.');
const shellVersion = Number.parseInt(major);

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { dev, utils, uiUtils } = Me.imports;
const { sessionManager } = Me.imports;

var WorkspaceViewManager = class WorkspaceViewManager {
    constructor() {
        try {
            Me.workspaceViewManager = this;
            this.injections = {}
            this.thumbnailBoxes = [];
            this._visible = Me.session.activeSession.Options.ShowWorkspaceOverlay;
            this.menus = [];
            this._runCount = 0;
            this.gsWorkspaces = {};

            if (!this.injections['addThumbnails'])
                this.injections['addThumbnails'] = workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails;
            if (!this.injections['syncStacking'])
                this.injections['syncStacking'] = workspaceThumbnail.WorkspaceThumbnail.prototype.syncStacking;

            workspaceThumbnail.WorkspaceThumbnail.prototype.syncStacking = function(stackIndices) {
                // Disabling this prevents the thumbnail window clones from restacking
                // During the succseive updates of refreshThumbNailsBoxes() to maintain the background state
                // This causes the windows to flash as it rebuilds when switching workspaces
                return;
                //Me.workspaceViewManager.injections['syncStacking'].call(this, stackIndices); // Call parent
            };
            workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails = function(start, count) {
                Me.workspaceViewManager.injections['addThumbnails'].call(this, start, count); // Call parent
                this.connect('destroy', () => {
                    if (this._bgManager) { this._bgManager.destroy(); this._bgManager = null; }
                });
                Me.workspaceViewManager.thumbnailBoxes = this._thumbnails;
                Me.workspaceViewManager.refreshThumbNailsBoxes();
            };

            if (shellVersion < 40) return;
            if (!this.injections['_addWindowClone'])
            this.injections['_addWindowClone'] = workspaceThumbnail.ThumbnailsBox.prototype._addWindowClone;
            // Re-implementation from earlier shell versions to show the desktop background in the workspace thumbnail
            workspaceThumbnail.ThumbnailsBox.prototype._addWindowClone = function(win) {
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
            };
            if (!this.injections['Workspace_init'])
                this.injections['Workspace_init'] = workspace.WorkspaceBackground.prototype._init;
            workspace.Workspace.prototype._init = function(metaWorkspace, monitorIndex, overviewAdjustmentt) {
                Me.workspaceViewManager.injections['Workspace_init'].call(this, metaWorkspace, monitorIndex, overviewAdjustment); // Call parent
                Me.workspaceViewManager.gsWorkspaces[metaWorkspace] = this;
                this.connect('destroy', () => delete Me.workspaceViewManager.gsWorkspaces[metaWorkspace]);
            };
        } catch(e) { dev.log(e) }
    }
    destroy() {
        try {
        workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails = this.injections['addThumbnails'];
        workspaceThumbnail.WorkspaceThumbnail.prototype.syncStacking = this.injections['syncStacking'];
        workspace.WorkspaceBackground.prototype._init = this.injections['Workspace_init'];
        workspaceThumbnail.WorkspaceThumbnail.prototype._addWindowClone = this.injections['_addWindowClone'];
        delete this.injections;
        } catch(e) { dev.log(e) }
    }
    refreshThumbNailsBoxes() {
        try {
        this._visible = Me.session.activeSession.Options.ShowWorkspaceOverlay;

        this.thumbnailBoxes.forEach(function(thumbnailBox, i) {
            try {
            // Find active workset for thumbnailbox
            thumbnailBox.workset = null;
            Me.session.Worksets.forEach(function (worksetBuffer, index) {
                if (worksetBuffer.WorksetName == Me.session.workspaceMaps['Workspace'+i].currentWorkset) {
                    thumbnailBox.workset = Me.session.Worksets[index];
                }
            }, this);

            // New background for thumbnail box
            if (thumbnailBox.newbg) thumbnailBox.newbg.unref()
            thumbnailBox.newbg = new Meta.Background({ meta_display: Me.gScreen });
            let bg = thumbnailBox.workset || Me.session.DefaultWorkset;
            thumbnailBox.newbg.set_file(Gio.file_new_for_path(bg.BackgroundImage),
                imports.gi.GDesktopEnums.BackgroundStyle[bg.BackgroundStyle] || imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);
            if (shellVersion >= 40) {
                if (!thumbnailBox._bgManager)
                    thumbnailBox._bgManager = new Background.BackgroundManager({ monitorIndex: Main.layoutManager.primaryIndex,
                                                                                    container: thumbnailBox._contents,
                                                                                    vignette: false });

                this.gsWorkspaces.forEachEntry(function(metaWorkspace, gsWorkspace, ii) {
                    if (thumbnailBox.metaWorkspace == metaWorkspace)
                        this.gsWorkspaces[metaWorkspace]._background._bgManager.backgroundActor.content.background = thumbnailBox.newbg;
                        //this.gsWorkspaces[metaWorkspace]._layoutManager._bgManagers[0].backgroundActor.content.background = thumbnailBox.newbg;
                }, this);
            }
            if (thumbnailBox._bgManager) {
                // Prevent excessive recursion but enforce background updates during various events
                thumbnailBox._updated = false;
                thumbnailBox._bgManager.connect('changed', ()=> { if (!thumbnailBox._updated) Me.workspaceViewManager.refreshThumbNailsBoxes(); thumbnailBox._updated = true; });
                thumbnailBox._bgManager.backgroundActor.content.background = thumbnailBox.newbg;
            }

            // Stop after background change if overlay box is not enabled
            if (!Me.session.activeSession.Options.ShowWorkspaceOverlay) return;

            // Delete old overlay box and rebuild
            if (thumbnailBox.worksetOverlayBox)
                thumbnailBox.worksetOverlayBox.destroy_all_children();
            thumbnailBox.worksetOverlayBox = new St.BoxLayout({style_class: 'workspace-overlay', y_align: Clutter.ActorAlign.START, x_align: Clutter.ActorAlign.START, x_expand: true, y_expand: true});
            thumbnailBox.worksetOverlayBox.width = thumbnailBox._contents.width;
            thumbnailBox.worksetOverlayBox.height = thumbnailBox._contents.height;

            // Set text for any custom workspaces
            thumbnailBox.worksetLabel = new St.Label({style_class: 'workset-label', x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.END, y_expand: true, x_expand: true,});
            thumbnailBox.worksetOverlayBox.add(thumbnailBox.worksetLabel, {});
            let text='';
            if (Me.session.workspaceMaps['Workspace'+i] != undefined)
                text = Me.session.workspaceMaps['Workspace'+i].currentWorkset;
            thumbnailBox.worksetLabel.set_text(text);

            // Action buttons for custom workspaces
            if (thumbnailBox.workset) {
                let icon_options = {icon_size: 140, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.END, x_expand: true, y_expand: true};
                uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'document-edit-symbolic', () => { Me.session.editWorkset(thumbnailBox.workset); }, icon_options, {msg: "Edit '"+thumbnailBox.workset.WorksetName+"'"});
                uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'image-x-generic-symbolic', () => { Me.session.setWorksetBackgroundImage(thumbnailBox.workset); }, icon_options, {msg: "Change the background for '"+thumbnailBox.workset.WorksetName+"'"})
                uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'window-close-symbolic', () => { Me.session.closeWorkset(thumbnailBox.workset); Me.workspaceViewManager.refreshThumbNailsBoxes(); }, icon_options, {msg: "Disengage '"+thumbnailBox.workset.WorksetName+"'"})
            }

            // Image for empty workspace thumbnail
            if (!thumbnailBox.workset /* && Me.workspaceManager.NumGlobalWorkspaces == i+1 */ ) {
                if (!Me.session.activeSession.Options.ShowPanelIndicator)
                    uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'emblem-system-symbolic', () => { Me.session.activeSession.Options.ShowPanelIndicator = true; Me.session.applySession(); }, {icon_size: 170, x_align: St.Align.START, y_align: Clutter.ActorAlign.END}, {msg: "Show the panel indicator menu"})

                let btn = uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'go-jump-symbolic', () => {
                    try {
                    if (btn.menu)
                        return btn.menu.bye();

                    btn.menu = new popupMenu.PopupMenu(btn, St.Align.START, St.Side.TOP);
                    this.menus.push(btn.menu)
                    btn.menu.bye = function() {
                        Main.uiGroup.remove_actor(btn.menu.actor);
                        btn.menu.actor.hide();
                        btn.menu.destroy();
                        btn.menu = null;
                        return true;
                    }

                    let menuItems = [];
                    let defaultMenuItem;
                    Me.session.Worksets.forEach(function(workset, ii) {
                        // Don't show active worksets
                        let activeIndex = Me.session.getWorksetActiveIndex(workset);
                        if (activeIndex > -1) return;

                        let menuItem = new popupMenu.PopupMenuItem('');
                        menuItems.push(menuItem);
                        if (workset.WorksetName == Me.session.DefaultWorkset.WorksetName) defaultMenuItem = menuItem;
                        menuItem.workset = workset;
                        menuItem.label.set_text(menuItem.workset.WorksetName);

                        menuItem.buttonPressId = menuItem.connect('button-press-event', () => {
                            Me.workspaceManager.loadDefaults = false;
                            Me.workspaceManager.noUpdate = true;
                            Me.workspaceManager.switchToWorkspace(i);
                            Me.session.displayWorkset(workset);
                            // Something is switching to the last workspace after this menu is destroyed
                            // This is my hack to make sure we stay on the right one
                            GLib.timeout_add(null, 230, ()=> {
                                Me.workspaceManager.switchToWorkspace(i);
                                Me.workspaceManager.loadDefaults = true;
                                Me.workspaceManager.noUpdate = false;
                                Me.workspaceManager._workspaceUpdate();
                            });
                            btn.menu.bye();
                        } );

                        if (Me.session.activeSession.Default == menuItem.workset.WorksetName)
                            btn.menu.defaultItem = menuItem.workset.WorksetName

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
                        } );
                        menuItem.setOrnament(popupMenu.Ornament.NONE);
                        btn.menu.addMenuItem(menuItem, 0);
                    }

                    Main.uiGroup.add_actor(btn.menu.actor);
                    GLib.timeout_add(null, 5000, ()=> { if (!utils.isEmpty(btn.menu)) btn.menu.bye(); });
                    btn.menu.open();
                    } catch(e) { dev.log(e) }
                }, {icon_size: 170, y_align: Clutter.ActorAlign.END}, {msg: "Choose a custom workspace to load here"});
                btn.connect('destroy', () => { if (btn.menu) btn.menu.bye(); } );

                uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'document-new-symbolic', () => {
                    Me.workspaceManager.switchToWorkspace(i); Me.session.newWorkset(null, true, true);
                }, {icon_size: 170, y_align: Clutter.ActorAlign.END}, {msg: "Create new custom workspace here"});
            }

            // Apply changes
            thumbnailBox._contents.add_child(thumbnailBox.worksetOverlayBox);
            } catch(e) { dev.log(e) }
        }, this)

        } catch(e) { dev.log(e) }
    }
};