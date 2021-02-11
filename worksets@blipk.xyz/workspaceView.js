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
const Main = imports.ui.main;
const { workspace, workspacesView, workspaceThumbnail, popupMenu } = imports.ui;
const { GObject, Meta, Wnck, Shell, GLib, St, Clutter, Gtk, Gio } = imports.gi;

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

            if (!this.injections['addThumbnails']) this.injections['addThumbnails'] = workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails;

            workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails = function(start, count) {
                Me.workspaceViewManager.injections['addThumbnails'].call(this, start, count); // Call parent
                Me.workspaceViewManager.thumbnailBoxes = this._thumbnails;
                Me.workspaceViewManager.refreshThumbNailsBoxes();
            };
        } catch(e) { dev.log(e) }
    }
    cleanupInjections() {
        workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails = this.injections['addThumbnails'];
        delete this.injections;
    }
    destroy() {
        try {
            this.cleanupInjections();
        } catch(e) { dev.log(e) }
    }
    refreshThumbNailsBoxes() {
        try {
        this._visible = Me.session.activeSession.Options.ShowWorkspaceOverlay;
        if (!this._visible) return;

        this.thumbnailBoxes.forEach(function(thumbnailBox, i) {
            try {
            if (!thumbnailBox._bgManager) return;

            thumbnailBox.worksetOverlayBox = new St.BoxLayout({style_class: 'workspace-overlay', y_align: Clutter.ActorAlign.END, x_align: Clutter.ActorAlign.END});
            thumbnailBox.worksetOverlayBox.width = thumbnailBox._contents.width;
            //thumbnailBox.worksetOverlayBox.height = thumbnailBox._contents.height;

            thumbnailBox.worksetLabel = new St.Label({style_class: 'workset-label'});
            thumbnailBox.worksetOverlayBox.add(thumbnailBox.worksetLabel, {});

            // Default background
            let newbg = new Meta.Background({ meta_display: Me.gScreen });
            newbg.set_file(Gio.file_new_for_path(Me.session.DefaultWorkset.BackgroundImage), imports.gi.GDesktopEnums.BackgroundStyle[Me.session.DefaultWorkset.BackgroundStyle] || imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);

            // Find backgrounds for active custom workspaces
            thumbnailBox.workset = null;
            Me.session.Worksets.forEach(function (worksetBuffer, index) {
                if (worksetBuffer.WorksetName == Me.session.workspaceMaps['Workspace'+i].currentWorkset) {
                    newbg.set_file(Gio.file_new_for_path(Me.session.Worksets[index].BackgroundImage), imports.gi.GDesktopEnums.BackgroundStyle[Me.session.Worksets[index].BackgroundStyle] || imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);
                    thumbnailBox.workset = Me.session.Worksets[index];
                }
            }, this);


            // Faster than setting text-shadows in CSS
            //let fx = new uiUtils.TextOutlineEffect({ shader_type: Clutter.ShaderType.FRAGMENT_SHADER });
            //thumbnailBox.worksetLabel.clutter_text.add_effect_with_name('text-outline', fx);

            /*
            thumbnailBox.worksetUnderlayBox = new St.BoxLayout({style_class: 'workspace-underlay', y_align: Clutter.ActorAlign.END, x_align: Clutter.ActorAlign.END});
            thumbnailBox.worksetUnderlayBox.width = thumbnailBox._contents.width;
            thumbnailBox.worksetLabelUnderlay = new St.Label({style_class: 'workset-label-underlay'});
            thumbnailBox.worksetUnderlayBox.add(thumbnailBox.worksetLabelUnderlay, {x_fill: true, y_fill: true, x_align: St.Align.START, y_align: St.Align.END, expand: true});
            thumbnailBox.worksetLabelUnderlay.clutter_text.set_scale(1.1, 1.1);
            */

            // Set text for any custom workspaces
            let text = '';
            if (Me.session.workspaceMaps['Workspace'+i] != undefined) text = Me.session.workspaceMaps['Workspace'+i].currentWorkset;
            thumbnailBox.worksetLabel.set_text(text);
            //thumbnailBox.worksetLabelUnderlay.set_text(text);

            // Action buttons for custom workspaces
            if (thumbnailBox.workset) {   
                uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'document-edit-symbolic', () => { Me.session.editWorkset(thumbnailBox.workset); }, {icon_size: 170}, {msg: "Edit '"+thumbnailBox.workset.WorksetName+"'"});
                uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'image-x-generic-symbolic', () => { Me.session.setWorksetBackgroundImage(thumbnailBox.workset); }, {icon_size: 170}, {msg: "Change the background for '"+thumbnailBox.workset.WorksetName+"'"})
                uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'window-close-symbolic', () => { Me.session.closeWorkset(thumbnailBox.workset) }, {icon_size: 170}, {msg: "Disengage '"+thumbnailBox.workset.WorksetName+"'"})
            }

            // Image for empty workspace thumbnail
            if (!thumbnailBox.workset /* && Me.workspaceManager.NumGlobalWorkspaces == i+1 */ ) {
                if (!Me.session.activeSession.Options.ShowPanelIndicator)
                    uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'emblem-system-symbolic', () => { Me.session.activeSession.Options.ShowPanelIndicator = true; Me.session.applySession(); }, {icon_size: 170, x_align: St.Align.START}, {msg: "Show the panel indicator menu"})

                let btn = uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'go-jump-symbolic', () => {
                    try {
                        if (btn.menu) {
                            btn.menu.bye();
                            return;
                        }
                        btn.menu = new popupMenu.PopupMenu(btn, St.Align.START, St.Side.TOP);
                        this.menus.push(btn.menu)
                        btn.menu.bye = function() {
                            Main.uiGroup.remove_actor(btn.menu.actor);
                            btn.menu.actor.hide();
                            btn.menu.destroy();
                            btn.menu = null;
                            return true;
                        }
                        btn.menu.actor.add_style_class_name('panel-menu');

                        let menuItems = [];
                        let defaultMenuItem;
                        Me.session.Worksets.forEach(function(workset, ii) {
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

                        if (!utils.isEmpty(defaultMenuItem)) {
                            btn.menu.moveMenuItem(defaultMenuItem, 0);
                            defaultMenuItem.setOrnament(popupMenu.Ornament.DOT);
                        }

                        Main.uiGroup.add_actor(btn.menu.actor);
                        GLib.timeout_add(null, 5000, ()=> { if (!utils.isEmpty(btn.menu)) btn.menu.bye(); });
                        btn.menu.open();
                    } catch(e) { dev.log(e) }
                }, {icon_size: 170}, {msg: "Choose a custom workspace to load here"});
                btn.connect('destroy', () => {
                    if (btn.menu) btn.menu.bye();
                } );


                uiUtils.createIconButton(thumbnailBox.worksetOverlayBox, 'document-new-symbolic', () => {
                    Me.workspaceManager.switchToWorkspace(i); Me.session.newWorkset(null, true, true);
                }, {icon_size: 170}, {msg: "Create new custom workspace here"});
                newbg.set_file(Gio.file_new_for_path(Me.session.DefaultWorkset.BackgroundImage), imports.gi.GDesktopEnums.BackgroundStyle[Me.session.DefaultWorkset.BackgroundStyle] || imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);
            }

            // Prevent excessive recursion but enforce background updates during various events
            thumbnailBox._updated = false;
            thumbnailBox._bgManager.connect('changed', ()=> { if (!thumbnailBox._updated) Me.workspaceViewManager.refreshThumbNailsBoxes(); thumbnailBox._updated = true; });

            // Apply changes
            thumbnailBox._bgManager.backgroundActor.background = newbg;
            //thumbnailBox._contents.add_child(thumbnailBox.worksetUnderlayBox);
            thumbnailBox._contents.add_child(thumbnailBox.worksetOverlayBox);

            } catch(e) { dev.log(e) }
        }, this)

        } catch(e) { dev.log(e) }
    }
};
