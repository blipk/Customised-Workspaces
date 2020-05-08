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


var WorkspaceViewManager = class WorkspaceViewManager { 
    constructor() {
        try { 
            this.injections = {}
            this.thumbnailBoxes = [];
            this.injections['addThumbnails'] = workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails;

            workspaceThumbnail.ThumbnailsBox.prototype.addThumbnails = function(start, count) {
                Me.workspaceViewManager.injections['addThumbnails'].call(this, start, count); // Call parent
                Me.workspaceViewManager.thumbnailBoxes = this._thumbnails;
                Me.workspaceViewManager.refreshThumbNailsBoxes();
            };
        } catch(e) { dev.log(e) }
    }
    destroy() {
        try {
            workspaceThumbnail.WorkspaceThumbnail.prototype.addThumbnails = this.injections['addThumbnails'];
        } catch(e) { dev.log(e) }
    }
    refreshThumbNailsBoxes() {
        try {
        this.thumbnailBoxes.forEach(function(thumbnailBox) {
            try {
            let worksetInfoBox = new popupMenu.PopupBaseMenuItem();
            
            worksetInfoBox.width = thumbnailBox._contents.width;
            worksetInfoBox.height = thumbnailBox._contents.height / 3;
    
            let worksetLabel = new St.Label({text: '',
                                            style_class: 'workset-workspace-label',
                                            y_expand: true,
                                            y_align: Clutter.ActorAlign.CENTER});
            worksetInfoBox.add(worksetLabel, {x_fill: true, y_fill: false, x_align: St.Align.START, y_align: St.Align.MIDDLE, expand: true});
    
            Me.session.activeSession.workspaceMaps.forEachEntry(function(workspaceMapKey, workspaceMapValues, i) {
                if (parseInt(workspaceMapKey.substr(-1, 1)) == thumbnailBox.metaWorkspace.index() && workspaceMapValues.currentWorkset != '') {
                    worksetLabel.set_text(workspaceMapValues.currentWorkset);
                
                    Me.session.activeSession.Worksets.forEach(function (worksetBuffer, index) {
                        if (worksetBuffer.WorksetName != workspaceMapValues.currentWorkset) return;
                        let newbg = new Meta.Background({ meta_display: Me.gScreen });
                        newbg.set_file(Gio.file_new_for_path(Me.session.activeSession.Worksets[index].BackgroundImage), imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);
                        thumbnailBox._bgManager.backgroundActor.background = newbg;
                        thumbnailBox._bgManager.connect('changed', ()=> { Me.workspaceViewManager.refreshThumbNailsBoxes() })
                    }, this);
                }
            }, this);
    
            thumbnailBox._contents.add_child(worksetInfoBox);

            } catch(e) { dev.log(e) }
        }, this)

        } catch(e) { dev.log(e) }
    }
};

/*
                    
                    
*/