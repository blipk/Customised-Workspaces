//? Generate SVG's and apply themes
// Extend/Inject WorkspacesView/WorkspaceThumbnail
// - create a toolbar area for the fav/worksets and allow them to be dragged onto workspaces as well as similar edit options to the panel indicator
// - few basic option/switches on the toolbar as well - same as on panel indicator
// - Add a draggable fav apps editor to the object editor


// External imports
const Main = imports.ui.main;
const Gettext = imports.gettext;
const { workspace, workspacesView, workspaceThumbnail, popupMenu } = imports.ui;
const { GObject, Meta, Wnck, Shell, GLib, St, Clutter, Gtk, Gio } = imports.gi;

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { dev, utils, uiUtils } = Me.imports;
const { sessionManager } = Me.imports;

let injections = {};

var WorkspaceViewManager = class WorkspaceViewManager { 
    constructor() {
        try {          
            injections['_createBackground'] = workspaceThumbnail.WorkspaceThumbnail.prototype._createBackground;
            dev.log(workspaceThumbnail.WorkspaceThumbnail._createBackgroundOriginal)
            workspaceThumbnail.WorkspaceThumbnail.prototype._createBackground = function() {
                injections['_createBackground'].call(this); // Call parent
                
                
                //this._bgManager._container.remove_child(this._bgManager.backgroundActor);
                let worksetInfoBox = new popupMenu.PopupBaseMenuItem();
                //let newbg = uiUtils.setImage('/home/kronosoul/Pictures/duat-blk.jpg', worksetInfoBox);
                worksetInfoBox.width = this._contents.width;
                worksetInfoBox.height = this._contents.height / 3;
                worksetInfoBox.set_x_align(St.Align.END)

                let worksetLabel = new St.Label({text: '',
                                                style_class: 'test-label',
                                                y_expand: true,
                                                y_align: Clutter.ActorAlign.CENTER});
                worksetInfoBox.add(worksetLabel, {x_fill: true, y_fill: false, x_align: St.Align.START, y_align: St.Align.MIDDLE, expand: true});

                Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
                    if (parseInt(workspaceMapKey.substr(-1, 1)) == this.metaWorkspace.index() && workspaceMapValues.currentWorkset != '') {
                        worksetLabel.set_text(workspaceMapValues.currentWorkset);
                    
                        Me.session.activeSession.Worksets.forEach(function (worksetBuffer, index) {
                            if (worksetBuffer.WorksetName != workspaceMapValues.currentWorkset) return;
                            let newbg = new Meta.Background({ meta_display: Me.gScreen });
                            newbg.set_file(Gio.file_new_for_path(Me.session.activeSession.Worksets[index].BackgroundImage), imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);
                            this._bgManager.backgroundActor.background = newbg;
                        }, this);
                    }
                }, this);
                
                
                 this._contents.add_child(worksetInfoBox);
            };
        } catch(e) { dev.log(e) }
    }
    destroy() {
        try {

        } catch(e) { dev.log(e) }
    }

};

/*
                    
                    
*/