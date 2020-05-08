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
        this.thumbnailBoxes.forEach(function(thumbnailBox, i) {
            try {
            if (thumbnailBox.worksetInfoBox) thumbnailBox.worksetInfoBox.destroy();
            if (!thumbnailBox._bgManager) return;

            thumbnailBox.worksetInfoBox = new St.BoxLayout();
            thumbnailBox.worksetInfoBox.width = thumbnailBox._contents.width;
            thumbnailBox.worksetInfoBox.height = thumbnailBox._contents.height / 3;
            
            thumbnailBox.worksetLabel = new St.Label({style_class: 'workset-workspace-label'});
            thumbnailBox.worksetInfoBox.add(thumbnailBox.worksetLabel, {x_fill: true, y_fill: false, x_align: St.Align.START, y_align: St.Align.MIDDLE, expand: true});
            
            // Default background
            let newbg = new Meta.Background({ meta_display: Me.gScreen });
            newbg.set_file(Gio.file_new_for_path(Me.session.activeSession.Worksets[0].BackgroundImage), imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);

            // Find backgrounds for active custom workspaces
            let text = Me.session.activeSession.workspaceMaps['Workspace'+i].currentWorkset;
            thumbnailBox.worksetLabel.set_text(text);
            Me.session.activeSession.Worksets.forEach(function (worksetBuffer, index) {
                if (worksetBuffer.WorksetName == Me.session.activeSession.workspaceMaps['Workspace'+i].currentWorkset)
                    newbg.set_file(Gio.file_new_for_path(Me.session.activeSession.Worksets[index].BackgroundImage), imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);
            }, this);

            // Image for last workspace thumbnail
            if (Me.workspaceManager.NumGlobalWorkspaces == i+1)
                newbg.set_file(Gio.file_new_for_path(Me.session.activeSession.Worksets[0].BackgroundImage), imports.gi.GDesktopEnums.BackgroundStyle.ZOOM);
            
            // Prevent excessive recursion but enforce background updates during various events
            thumbnailBox._updated = false;
            thumbnailBox._bgManager.connect('changed', ()=> { if (!thumbnailBox._updated) Me.workspaceViewManager.refreshThumbNailsBoxes(); thumbnailBox._updated = true; });

            // Apply changes
            thumbnailBox._bgManager.backgroundActor.background = newbg;
            thumbnailBox._contents.add_child(thumbnailBox.worksetInfoBox);
            } catch(e) { dev.log(e) }
        }, this)

        } catch(e) { dev.log(e) }
    }
};

/*
                    
                    
*/