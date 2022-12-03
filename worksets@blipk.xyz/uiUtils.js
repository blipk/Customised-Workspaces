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
const { GObject, St, Clutter, Gio, GLib, Gtk, Cogl } = imports.gi;
const Main = imports.ui.main;
const CheckBox  = imports.ui.checkBox.CheckBox;
const { modalDialog, shellEntry, popupMenu } = imports.ui;
const { extensionUtils, util } = imports.misc;

// Internal imports
const Me = extensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const { dev, utils, fileUtils } = Me.imports;
const tweener = imports.tweener.tweener || imports.ui.tweener;

//For adding IconButtons on to PanelMenu.MenuItem buttons or elsewhere
function createIconButton (parentItem, iconNames, callback, options, tooltip) { //St.Side.RIGHT
    try {
    if (Array.isArray(iconNames))
        var [iconNameURI, alternateIconName] = iconNames;
    else iconNameURI = iconNames;
    let defaults = {icon_name: iconNameURI,
                              style_class: 'icon-button',
                              x_expand: false,
                              x_align: Clutter.ActorAlign.CENTER,
                              y_expand: true,
                              y_align: Clutter.ActorAlign.CENTER};
    options = {...defaults, ...options };
    //dev.log(iconNameURI, options)

    let icon = new St.Icon(options);
    let iconButton = new St.Button({
        child: icon, style_class: options.style_class || 'icon-button', can_focus: true, x_expand: false, y_expand: false,
    });
    iconButton.icon = icon;
    parentItem.add_child ? parentItem.add_child(iconButton) : parentItem.actor.add_child(iconButton);
    parentItem.iconButtons = parentItem.iconButtons || new Array();
    parentItem.iconsButtonsPressIds = parentItem.iconButtons || new Array();
    if (tooltip) {
        iconButton.tooltip = tooltip;
        createTooltip(iconButton, tooltip);
    }
    parentItem.iconButtons.push(iconButton);

    iconButton.focus = false;
    iconButton.leaveEvent = iconButton.connect('leave-event', ()=>{iconButton.focus = false;  iconButton.icon.icon_name = iconNameURI; return Clutter.EVENT_STOP;});
    iconButton.enterEvent = iconButton.connect('enter-event', ()=>{ if (alternateIconName) iconButton.icon.icon_name = alternateIconName; return Clutter.EVENT_STOP;});
    iconButton.pressEvent = iconButton.connect('button-press-event', ()=>{iconButton.focus=true; return Clutter.EVENT_STOP;});
    iconButton.releaseEvent = iconButton.connect('button-release-event', ()=>{ if (iconButton.focus==true) callback(); return Clutter.EVENT_STOP;});
    parentItem.iconsButtonsPressIds.push( [iconButton.pressEvent, iconButton.releaseEvent, iconButton.leaveEvent ] );
    parentItem.destroyIconButtons = function() {
        parentItem.iconButtons.forEach(function(iconButton) {
            //iconButton.destroy();
        }, this);
        parentItem.iconButtons = [];
        parentItem.iconsButtonsPressIds = [];
    }
    return iconButton;
    } catch(e) { dev.log(e) }
}

//Display a short overlay message on the screen for user feedback etc..
let messages = [];
function showUserNotification(input, overviewMessage=false, fadeTime=2.9) {
    dev.log('Notification', input);
    removeAllUserNotifications();

    if (overviewMessage) {
        var label = null;
        Main.overview.setMessage(_(input), { forFeedback: true });
    } else {
        var label = new St.Label({ style_class: 'feedback-label', text: _(input) });
        messages.push(label);
        var lastItem = messages.length-1;
        Main.uiGroup.add_actor(messages[lastItem]);
        messages[lastItem].opacity = 255;
        let monitor = Main.layoutManager.primaryMonitor;
        messages[lastItem].set_position(monitor.x + Math.floor(monitor.width / 2 - messages[lastItem].width / 2), monitor.y + Math.floor(monitor.height / 2 - messages[lastItem].height / 2));
        if (fadeTime > 0) removeUserNotification(label, fadeTime);
        return label;
    }
}
function removeUserNotification(label, fadeTime) {
    if (!label) return;
    if (!fadeTime) {
        Main.uiGroup.remove_actor(label);
        messages = messages.filter(item => item != label);
        if (label.attachedTo) label.attachedTo.notificationLabel = null;
        label = null;
    } else {
        tweener.addTween(label, { opacity: 0, time: fadeTime || 1.4, transition: 'easeOutQuad', onComplete: () => {
                Main.uiGroup.remove_actor(label);
                messages = messages.filter(item => item != label);
                if (label.attachedTo) label.attachedTo.notificationLabel = null;
                label = null;
        } });
    }
}
function removeAllUserNotifications(fadeTime) {
    messages.forEach(function(message, i) {
        removeUserNotification(message, fadeTime)
    }, this);
}

function createTooltip(widget, tooltip) {
    try {
    if (!tooltip) return;
    widget.tooltip = tooltip;

    if (widget.tooltipEnterEvent) widget.disconnect(widget.tooltipEnterEvent)
    if (widget.tooltipLeaveEvent) widget.disconnect(widget.tooltipLeaveEvent)
    if (widget.tooltipPressEvent) widget.disconnect(widget.tooltipPressEvent)
    if (widget.notificationLabel) {
        removeUserNotification(widget.notificationLabel, 0.1)
        widget.notificationLabel = false
        widget.hovering = false
    }

    widget.tooltipEnterEvent = widget.connect('enter_event', ()=>{
        widget.hovering = true;
        GLib.timeout_add(null, widget.tooltip.delay || 700, ()=> {
            // Ensure there is only one notification per widget
            if (widget.notificationLabel) return;
            // Create message
            if(widget.hovering && !widget.notificationLabel && (Me.session.activeSession.Options.ShowHelpers || widget.tooltip.force)) {
                widget.notificationLabel = showUserNotification(widget.tooltip.msg, widget.tooltip.overviewMessage || false, widget.tooltip.fadeTime || 0);
                widget.notificationLabel.attachedTo = widget;
            }
            // Make sure they're eventually removed for any missed cases
            GLib.timeout_add(null, widget.tooltip.disappearTime || 4000, ()=> { if (widget.notificationLabel) removeUserNotification(widget.notificationLabel, 1);});
        });

        //return Clutter.EVENT_STOP;
    });
    widget.tooltipLeaveEvent = widget.connect('leave_event', ()=>{
        widget.hovering = false;
        if (widget.notificationLabel)
            removeUserNotification(widget.notificationLabel, widget.tooltip.leaveFadeTime || 1.4);
        //return Clutter.EVENT_STOP;
    });

    widget.tooltipPressEvent = widget.connect('button-press-event', ()=>{
        widget.hovering = false;
        if (widget.notificationLabel)
            removeUserNotification(widget.notificationLabel, 0.7);
        //return Clutter.EVENT_STOP;
    });
    if (widget instanceof popupMenu.PopupSwitchMenuItem)
        widget.connect('toggled', ()=>{
            widget.hovering = false;
            if (widget.notificationLabel)
                removeUserNotification(widget.notificationLabel, 0.7);
                //return Clutter.EVENT_STOP;
        });
    } catch(e) { dev.log(e)}
}

let knownImages = {}; // Save on resources generating these in menu refreshes
function setImage(parent, imgFilePath = '') {
    try {
    imgFilePath = imgFilePath.replace("file://", "");
    let image;

    if (knownImages[imgFilePath]) {
        image = knownImages[imgFilePath];
    } else if (imgFilePath) {
        let img = new Gtk.Image({file: imgFilePath});

        let pixbuf = img.get_pixbuf()
        if (pixbuf === null) // file doesnt exist
            return (imgFilePath = '');

        const {width, height} = pixbuf;
        if (height == 0) return;

        image = new Clutter.Image();
        let success = image.set_data(
            pixbuf.get_pixels(),
            pixbuf.get_has_alpha()
            ? Cogl.PixelFormat.RGBA_8888
            : Cogl.PixelFormat.RGB_888,
            width,
            height,
            pixbuf.get_rowstride()
        );
        if (!success) throw Error("error creating Clutter.Image()");
    } else { // empty image if no file path
        image = new Clutter.Image();
    }
    parent.imgSrc = imgFilePath;
    parent.content = image;
    parent.height = 135;

    knownImages[imgFilePath] = image;
    return image;
    } catch(e) { dev.log(e) }
}

// Shader example
var TextOutlineEffect = GObject.registerClass({
    GTypeName: 'TextOutlineEffect'
}, class TextOutlineEffect extends Clutter.ShaderEffect {
	vfunc_get_static_shader_source () {
        try {
		return `uniform sampler2D tex;
                uniform vec4 v_color = vec4(0, 0, 0, 255);
                const vec4 u_outlineColor = vec4(255, 255, 255, 250);
                const float smoothing = 1.0/16.0;
                const float outlineWidth = 3.0/16.0;
                const float outerEdgeCenter = 0.5 - outlineWidth;

                void main() {
                    float distance = texture2D(tex, cogl_tex_coord_in[0].xy).a;
                    float alpha = smoothstep(outerEdgeCenter - smoothing, outerEdgeCenter + smoothing, distance);
                    float border = smoothstep(0.5 - smoothing, 0.5 + smoothing, distance);
                    gl_FragColor = vec4( mix(u_outlineColor.rgb, v_color.rgb, border), alpha );
                }`;
        } catch(e) { dev.log(e) }
	}

	vfunc_paint_target (paint_context) {
        try {
        //this.set_uniform_value("u_texture", 0);
        //this.set_uniform_value('FontColor', 255255255);
        //this.set_uniform_value('OutlineColor', 255);
        super.vfunc_paint_target(paint_context);
        } catch(e) { dev.log(e) }
	}
});

//Modal dialog popup based off runDialog that can display a message and/or get user input from a text box or from sets of JSObjects
//Object Editor Dialog
var ObjectInterfaceDialog = GObject.registerClass({
    GTypeName: 'Worksets_ObjectInterfaceDialog'
}, class ObjectInterfaceDialog extends modalDialog.ModalDialog {
    _init(dialogText=null, callback=null,
        showTextInput=true, disableTextInput=false,
        jsobjectsSets=[], /*array of js objects or of strings to valid directories with .json files*/
        objectSetMasks=[{objectNameIdentifier: 'Object Set Display Name'}],
        buttons=null,
        defaultText = ''
        ) {

        if (typeof dialogText === 'object') {
            super._init(dialogText);
            return;
        }

        this._objectsSetBoxes = [];
        this.DIALOG_GROW_TIME = 0.1;
        this._callback = null;

        if (typeof callback !== 'function') throw TypeError('ObjectInterfaceDialog._init error: callback must be a function');
        this._callback = callback;

        try{
        super._init({ styleClass: 'object-dialog', destroyOnClose: false });
        //Label for our dialog/text field with text about the dialog or a prompt for user text input
        let stLabelUText = new St.Label({ style_class: 'object-dialog-label', text: _(dialogText) });
        let headerLabelArea = new St.BoxLayout();
        headerLabelArea.add(stLabelUText)

        //Text field for user input
        this.stEntryUText = new St.Entry({ style_class: 'object-dialog-label', can_focus: true, text: defaultText });
        shellEntry.addContextMenu(this.stEntryUText);
        this.stEntryUText.label_actor = stLabelUText;
        //Customisation
        this.stEntryUText.set_hint_text ("");
        if (typeof dialogText !== 'string') {stLabelUText.hide();}
        if (showTextInput !== true) {this.stEntryUText.hide()};
        if (disableTextInput !== true) {
            this.setInitialKeyFocus(this.stEntryUText.clutter_text);
            this.stEntryUText.clutter_text.set_selection(0, 0);
        } else {
            this.stEntryUText.clutter_text.set_editable(false);
            this.stEntryUText.clutter_text.set_selectable(false);
        }

        //Error box that will appear to prompt for user validation of input
        this._errorBox = new St.BoxLayout({ style_class: 'object-dialog-error-box' });
        this.contentLayout.add(this._errorBox);
        let errorIcon = new St.Icon({ icon_name: 'dialog-error-symbolic', icon_size: 24, style_class: 'object-dialog-error-icon' });
        this._errorBox.add(errorIcon);
        this._errorMessage = new St.Label({ style_class: 'object-dialog-error-label' });
        this._errorMessage.clutter_text.line_wrap = true;
        this._errorBox.add(this._errorMessage);
        this._inputError = false;
        this._errorBox.hide();

        //Action buttons
        this.buttons = Array();
        buttons = (buttons == null) ? 'Done' : buttons;
        let defaults = [{ label: (buttons), default: true}];       //key: Clutter.KEY_Escape
        buttons = (typeof buttons == 'string') ? defaults : buttons;
        buttons.forEach(function (button, i) {
            if (button.action) button.action = button.action.bind(this);
            else button.action = ()=>{this.close()};

            this.buttons[i] = this.addButton(button);
            this.buttons[i].set_reactive(true);
            if (button.style_class) this.buttons[i].add_style_class_name(button.style_class);
        }, this);

        // Directories
        let jsobjectsSearchDirectories = null;
        if (typeof jsobjectsSets[0] === 'string') {
            let directoryFile = Gio.file_new_for_path(jsobjectsSets[0]);
            if (directoryFile.query_exists(null)) {
                jsobjectsSearchDirectories = jsobjectsSets;
            } else {
                stLabelUText.set_text("No saved objects found on disk.");
                jsobjectsSets = undefined;
            }
        }

        //Build objects in jsobjectSets from .json files in directory (or multiple - one objectSet of objects per directory)
        if (!utils.isEmpty(jsobjectsSearchDirectories)) {
            jsobjectsSets=[];
            jsobjectsSearchDirectories.forEach(function(directory, i){
                let childrenFilePropertiesArray = fileUtils.enumarateDirectoryChildren(directory);
                let tmpObjectsSet = [];
                childrenFilePropertiesArray.forEach(function(fileProperties, ii) {
                    if (fileProperties.extension==='json') {
                        let objectFromDirectoryFile = fileUtils.loadJSObjectFromFile(fileProperties.fullname, directory);
                        tmpObjectsSet.push(objectFromDirectoryFile);
                    }
                }, this);
                if (tmpObjectsSet[0]) {
                    jsobjectsSets.push(tmpObjectsSet);
                }

                let btn = createIconButton(headerLabelArea, 'document-open-symbolic', () => {
                    this.close();
                    util.spawn(['xdg-open', jsobjectsSearchDirectories[0]]);
                    btn.destroy();
                }, {icon_size: 20, style_class: 'open-backups-icon'}, {leaveFadeTime: 0.7, disappearTime: 4400, delay: 400, force: true, msg: "Open folder to manage backups (" + jsobjectsSearchDirectories[0] + ")"});
            }, this);

            if(!jsobjectsSets[0]) {
                stLabelUText.set_text("No saved objects found on disk.");
                jsobjectsSets = undefined;
            }
        }

        this.contentLayout.add(headerLabelArea);
        this.contentLayout.add(this.stEntryUText);

        if (jsobjectsSets) {
            //Build an area for each object set
            jsobjectsSets.forEach(function(objectSet, i){
                this._objectsSetBoxes[i] = new St.BoxLayout({ style_class: 'object-dialog-error-box', y_expand: true, x_expand: true, x_align: St.Align.MIDDLE });
                this._objectsSetBoxes[i].objectSetBoxStIcon = new St.Icon({ icon_name: 'insert-object-symbolic', icon_size: 18, style_class: 'object-dialog-error-icon' });
                //this._objectsSetBoxes[i].add(this._objectsSetBoxes[i].objectSetBoxStIcon, { y_align: St.Align.MIDDLE });
                this.contentLayout.add(this._objectsSetBoxes[i]);

                this._objectsSetBoxes[i]._objectSetBoxMessage = new St.Label({ style_class: 'object-dialog-error-label' });
                this._objectsSetBoxes[i]._objectSetBoxMessage.clutter_text.line_wrap = true;

                let setDisplayName = 'Object Set '+i;

                //Build area for each object
                this._objectsSetBoxes[i]._objectBoxes = [];
                let count = 0;
                objectSet.forEach(function(object, ii){
                    // Create a new line if there are too many objects
                    if (count == 4) {
                        i++;
                        count = 0;
                        this._objectsSetBoxes[i] = new St.BoxLayout({ style_class: 'object-dialog-error-box', y_expand: true, x_expand: true, x_align: St.Align.MIDDLE });
                        this.contentLayout.add(this._objectsSetBoxes[i]);
                        this._objectsSetBoxes[i]._objectBoxes = [];
                    }
                    count++;
                    //Box base
                    this._objectsSetBoxes[i]._objectBoxes[ii] = new St.BoxLayout({ style_class: 'object-dialog-item' });
                    //this._objectsSetBoxes[i]._objectBoxes[ii].set_vertical(true);
                    this._objectsSetBoxes[i].add(this._objectsSetBoxes[i]._objectBoxes[ii]);

                    //State/type icon
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStIcon = new St.Icon({ icon_name: 'insert-object-symbolic', icon_size: 14, style_class: 'object-dialog-item-icon' });
                    this._objectsSetBoxes[i]._objectBoxes[ii].add(this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStIcon);

                    //Labelled button to select the object
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton = new St.Button({
                        style_class: 'ci-action-btn', x_align: Clutter.ActorAlign.FILL, can_focus: true,
                        child: this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStIcon
                    });
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.set_x_align(Clutter.ActorAlign.START);
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.set_x_expand(false);
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.set_y_expand(false);
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.connect('button-press-event', ()=>{
                            this.popModal(); this.close(object); return object;
                    });
                    this._objectsSetBoxes[i]._objectBoxes[ii].add(this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton);

                    let objectDisplayName = 'Object '+ii;
                    Object.keys(object).forEach(function(objectkey, objectkeyIndex){
                        objectSetMasks.forEach(function(objectMask, objectMaskIndex) {
                            if (objectSetMasks[objectMaskIndex][objectkey]) {
                                objectDisplayName = object[objectkey];
                                setDisplayName = objectSetMasks[objectMaskIndex][objectkey];
                            }
                        }, this);
                    }, this);
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.set_label(objectDisplayName);
                }, this);

                if (this._objectsSetBoxes[i]._objectSetBoxMessage) this._objectsSetBoxes[i]._objectSetBoxMessage.set_text(setDisplayName);
                if (setDisplayName.trim() === "") this._objectsSetBoxes[i].remove_actor(this._objectsSetBoxes[i].objectSetBoxStIcon);
            }, this);
        }

        //Handler for text input actions
        this.stEntryUText.clutter_text.connect('activate', (o) => {
            this.popModal();
            this._checkInput(o.get_text());
            if (!this._inputError || !this.pushModal()) {
                this.popModal();
                this.close(o.get_text());
                return o.get_text();
            }
            return o.get_text();
        });

        this.open();
        } catch(e) { dev.log(e); }
    }
    open() {
        this._errorBox.hide();
        this._inputError = false;
        super.open(global.get_current_time(), true);
    }
    close(returnObject) {
        try {
        if (!returnObject) returnObject = this.stEntryUText.clutter_text.get_text();
        this._callback(returnObject);
        super.close();
        } catch(e) { dev.log(e); }
    }
    _checkInput(text) {
        this._inputError = false;

        if (text === '') {
            this._showError("Input required");
        }
    }
    _showError(message) {
        try {
        this._inputError = true;
        this._errorMessage.set_text(message);

        if (!this._errorBox.visible) {
            let [errorBoxMinHeight, errorBoxNaturalHeight] = this._errorBox.get_preferred_height(-1);
            let parentActor = this._errorBox.get_parent();
            parentActor.ease({ height: parentActor.height + errorBoxNaturalHeight, time: DIALOG_GROW_TIME, transition: 'easeOutQuad',
                               onComplete: () => {
                                   parentActor.set_height(-1);
                                   this._errorBox.show();
                               }
                             });
        }
        } catch (e) {dev.log(e);}
    }
});

//Object Editor Dialog
var ObjectEditorDialog = GObject.registerClass({
    GTypeName: 'Worksets_ObjectEditorDialog'
}, class ObjectEditorDialog extends modalDialog.ModalDialog {
    _init(dialogInfoTextStyle='', callback=null,
        editableObject=null, /*object to edit in the editor */
        editableProperties=[], /* {propertyName: 'Property Display Name', disabled: false, hidden: false, subObjectEditableProperties: editableProperties,  icon: icon-name, hintText: 'Hint text to display for St.Entry', minwidth: 20, subObjectEditableProperties=[]}*/
        buttons = null,
        dialogStyle = null,
        contentLayoutBoxStyleClass = ''
        ) {

        if (typeof callback !== 'function') throw TypeError('ObjectEditorDialog._init error: callback must be a function');
        this._callback = callback;

        if (editableObject[1]) {throw TypeError('Array passed to object editor, only supports objects with simple types or sub objects as simple bool/int enums.');}
        this.returnObject = editableObject;
        this.editableObject = editableObject;
        this._unreferencedObjectCopy = JSON.parse(JSON.stringify(editableObject));


        try{
        // Initialize dialog with style
        let defaults = { styleClass: 'object-dialog', destroyOnClose: true };
        dialogStyle = {...defaults, ...dialogStyle };
        super._init(dialogStyle);
        this.contentLayout.style_class = contentLayoutBoxStyleClass ? contentLayoutBoxStyleClass : this.contentLayout.style_class;

        //Label for our dialog/text field with text about the dialog or a prompt for user text input
        defaults = { style_class: 'object-dialog-label', text: _((dialogInfoTextStyle.text || dialogInfoTextStyle).toString()), x_align: St.Align.START, y_align: St.Align.START } ;
        dialogInfoTextStyle = (typeof dialogInfoTextStyle == 'string') ? defaults : {...defaults, ...dialogInfoTextStyle };
        let stLabelUText = new St.Label(dialogInfoTextStyle);

        dialogInfoTextStyle.x_align = Clutter.ActorAlign.FILL;
        if (dialogInfoTextStyle.text != '') this.contentLayout.add(stLabelUText);


        //*Error box that will appear to prompt for user validation of input //TO DO
        this._errorBox = new St.BoxLayout();
        this.contentLayout.add(this._errorBox);
        let errorIcon = new St.Icon({ icon_name: 'dialog-error-symbolic', icon_size: 24, style_class: 'object-dialog-error-icon' });
        this._errorBox.add(errorIcon);
        this._inputError = false;
        this._errorMessage = new St.Label({ style_class: 'object-dialog-error-label' });
        this._errorMessage.clutter_text.line_wrap = true;
        this._errorBox.add(this._errorMessage);
        this._errorBox.hide();

        //Action buttons
        this.buttons = Array();
        buttons = (buttons == null) ? 'Done' : buttons;
        defaults = [{ label: (buttons), default: true}];       //key: Clutter.KEY_Escape
        buttons = (typeof buttons == 'string') ? defaults : buttons;
        buttons.forEach(function (button, i) {
            if (button.action) button.action = button.action.bind(this);
            else button.action = this.close.bind(this);

            this.buttons[i] = this.addButton(button);
            this.buttons[i].set_reactive(true);
            if (button.style_class) this.buttons[i].add_style_class_name(button.style_class);
        }, this)

        //Create an area for each property of our object
        this._propertyBoxes = [];
        this.propertyKeys = Array();
        this.propertyValues = Array();

        this.propertyDisplayName = Array();
        this.propertyDisabled = Array();
        this.propertyHidden = Array();
        this.propertyLabelOnly = Array();
        this.propertyLabelStyle = Array();
        this.propertyBoxStyle = Array();
        this.propertyIconStyle = Array();
        this.subObjectMasks = Array();
        this.propertyBoxClickCallbacks = Array();
        if (editableObject) {
            editableObject.forEachEntry(function(key, value, i) {
                // Options for how to display each property section
                this.propertyKeys[i] = key;
                this.propertyValues[i] = value;
                this.propertyDisplayName[i] = '';
                this.propertyDisabled[i] = false;
                this.propertyHidden[i] = false;
                this.propertyLabelOnly[i] = false;
                this.propertyLabelStyle[i] = { style_class: 'spacing7', x_expand: true, y_expand: true, x_align: St.Align.END, y_align: Clutter.ActorAlign.CENTER};
                this.propertyBoxStyle[i] = {};
                this.propertyIconStyle[i] = {};
                this.subObjectMasks[i] = [];
                this.propertyBoxClickCallbacks[i] = (()=>{ dev.log("Clicked on " + this.propertyDisplayName[i]); });
                editableProperties.forEach(function(propertyDisplayOption, index) {
                    if (editableProperties[index][key]) {
                        this.propertyDisplayName[i] = editableProperties[index][key] || this.propertyDisplayName[i]

                        let {disabled, hidden, labelOnly, labelStyle, boxStyle, iconStyle, subObjectEditableProperties, boxClickCallback} = editableProperties[index];
                        this.propertyDisabled[i] = disabled || this.propertyDisabled[i];
                        this.propertyHidden[i] = hidden || this.propertyHidden[i];
                        this.propertyLabelOnly[i] = labelOnly || this.propertyLabelOnly[i];
                        this.propertyLabelStyle[i] = labelStyle || this.propertyLabelStyle[i];
                        this.propertyBoxStyle[i] = boxStyle || this.propertyBoxStyle[i];
                        this.propertyIconStyle[i] = iconStyle || this.propertyIconStyle[i];
                        this.subObjectMasks[i] = subObjectEditableProperties || this.subObjectMasks[i];
                        this.propertyBoxClickCallbacks[i] = boxClickCallback || (()=>{ dev.log("Clicked on " + this.propertyDisplayName[i]); });
                    }
                }, this);
                if (utils.isEmpty(this.propertyDisplayName[i])) return;
                if (this.propertyHidden[i]) return;
                if (value === undefined) return;
                if (value === null) return;

                //A box area for each property
                this._propertyBoxes[i] = new St.BoxLayout(this.propertyBoxStyle[i]);
                if (this.propertyIconStyle[i] != undefined && this.propertyIconStyle[i] != {}) {
                    this._propertyBoxes[i].propertyBoxStNameIcon = new St.Icon(this.propertyIconStyle[i]);
                    this._propertyBoxes[i].add(this._propertyBoxes[i].propertyBoxStNameIcon, this.propertyIconStyle[i]);
                }
                // :hover event doesn't work on style_class elements for BoxLayout, this allows using :focus for hover events
                this._propertyBoxes[i].connect('enter-event', ()=>{ this._propertyBoxes[i].grab_key_focus();});
                this._propertyBoxes[i].connect('leave-event', ()=>{ global.stage.set_key_focus(this); });
                this._propertyBoxes[i].connect('button-press-event', () => {
                    this.propertyBoxClickCallbacks[i].call(this, i);
                });
                this.contentLayout.add(this._propertyBoxes[i], this.propertyBoxStyle[i]);

                // Left side labelled button
                this._propertyBoxes[i]._propertyBoxMessageButton = new St.Button(this.propertyLabelStyle[i]);
                this._propertyBoxes[i]._propertyBoxMessage = new St.Label(this.propertyLabelStyle[i]);
                this._propertyBoxes[i]._propertyBoxMessage.set_text(this.propertyDisplayName[i]);
                this._propertyBoxes[i]._propertyBoxMessage.clutter_text.line_wrap = false;
                this._propertyBoxes[i]._propertyBoxMessageButton.add_actor(this._propertyBoxes[i]._propertyBoxMessage);
                //this._propertyBoxes[i]._propertyBoxMessageButton.set_label(this.propertyDisplayName[i])
                //this._propertyBoxes[i]._propertyBoxMessageButton.set_label_actor(this._propertyBoxes[i]._propertyBoxMessage.actor)
                this._propertyBoxes[i]._propertyBoxMessageButton.connect('button-press-event', () => {
                    this.propertyBoxClickCallbacks[i].call(this, i);
                });
                this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxMessageButton);

                //Property value editor element
                if (this.propertyLabelOnly[i]) return;
                if (typeof value === 'boolean') {
                    this._propertyBoxes[i]._propertyBoxEditorElement = new CheckBox('');
                    this._propertyBoxes[i]._propertyBoxEditorElement.actor.checked = editableObject[key];
                    this._propertyBoxes[i]._propertyBoxEditorElement.actor.connect('clicked', () => {editableObject[key] = this._propertyBoxes[i]._propertyBoxEditorElement.actor.checked});
                    this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxEditorElement.actor);
                } else if (typeof value === 'string' || typeof value === 'number') {
                    this._propertyBoxes[i]._propertyBoxEditorElement = new St.Entry({ style_class: 'object-dialog-label', can_focus: true, text: '', x_align: Clutter.ActorAlign.FILL, x_expand: true});
                    this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.min_width = 200;
                    this._focusElement = this._propertyBoxes[i]._propertyBoxEditorElement;  // To set initial focus
                    if (this.propertyDisabled[i] === true) {
                        this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.set_editable(false);
                        this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.set_selectable(false);
                        this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.set_max_length(value.length);
                    }
                    this._propertyBoxes[i]._propertyBoxEditorElement.set_text(value.toString());
                    this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxEditorElement);

                    this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.get_buffer().connect('inserted-text', (o, position, new_text, new_text_length, e) => {
                        if (typeof value !== 'number') return Clutter.EVENT_PROPAGATE;
                        if (new_text.search(/^[0-9]+$/i) === -1) {
                            o.delete_text(position, new_text_length);
                            return Clutter.EVENT_STOP;
                        }
                        return Clutter.EVENT_PROPAGATE;
                    });
                    this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.connect('text-changed', (o, e) => {
                        if (typeof value === 'number') editableObject[key] = parseInt(o.get_text());
                        else editableObject[key] = o.get_text();
                        return Clutter.EVENT_PROPAGATE;
                    });
                } else if (typeof value === 'object' && !Array.isArray(value)) {
                    // Any grouped sub objects must all be boolean (or TO DO int types)
                    // They will be displaye horizontally with labels above them

                    // Check for valid types in the sub object
                    let containsBooleans = true;
                    value.forEachEntry(function(subobjectKey, subobjectValue, i){
                        if (typeof subobjectValue != 'boolean') containsBooleans = false;
                    }, this);
                    if (!containsBooleans) return;

                    // Build UI
                    this._propertyBoxes[i]._boolBox = Array()
                    value.forEachEntry(function(subobjectKey, subobjectValue, n){
                        // Set up display masks for the subobject properties
                        let subObjectPropertyDisplayName = key;
                        let subObjectPropertyDisabled = false;   // TODO
                        let subObjectPropertyHidden = false;
                        let subObjectLabelOnly = false;
                        let subObjectToggleValidationCallback = (()=>{return [true];});
                        this.subObjectMasks[i].forEach(function(propertyMask, index) {
                            if (this.subObjectMasks[i][index][subobjectKey]) {
                                subObjectPropertyDisplayName = this.subObjectMasks[i][index][subobjectKey] || subObjectPropertyDisplayName;
                                subObjectPropertyDisabled = this.subObjectMasks[i][index].disabled || subObjectPropertyDisabled;
                                subObjectPropertyHidden = this.subObjectMasks[i][index].hidden || false;
                                subObjectLabelOnly = this.subObjectMasks[i][index].labelOnly || subObjectLabelOnly;
                                subObjectToggleValidationCallback = this.subObjectMasks[i][index].toggleValidationCallback || subObjectToggleValidationCallback;
                            }
                        }, this);
                        if (subObjectPropertyHidden) return;

                        //Vertical box area for each subobject property
                        this._propertyBoxes[i]._boolBox[n] = new St.BoxLayout({ vertical: true, reactive: true,
                            track_hover: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL});
                        this._propertyBoxes[i].add(this._propertyBoxes[i]._boolBox[n]);
                        //, { expand: true, reactive: true, track_hover: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL }

                        // Label
                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage = new St.Label();
                        value[subobjectKey] ? this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.set_style_class_name('label-enabled') :
                                                 this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.add_style_class_name('label-disabled');

                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.add_style_class_name('uri-element-label')
                        //this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.clutter_text.set_line_wrap(false);
                        this._propertyBoxes[i]._boolBox[n].add(this._propertyBoxes[i]._boolBox[n]._boolBoxMessage);
                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.set_text(subObjectPropertyDisplayName);

                        // Toggling Function
                        function togglingFunction() {
                            // subObjectToggleValidationCallback will return values to set for any other bool in the subobject and whether to toggle the current one
                            let [allowed, boolValues] = subObjectToggleValidationCallback.call(this, value, n);
                            if (!boolValues) boolValues = Object.values(value);
                            if (allowed) boolValues[n] = value[subobjectKey] = value[subobjectKey] ? false : true;
                            this._propertyBoxes[i]._boolBox.forEach(function(box, x) {
                                if(boolValues[x]) {
                                    value[Object.keys(value)[x]] = boolValues[x];
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.remove_style_class_name('label-disabled');
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.add_style_class_name('label-enabled');
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxEditorElement.actor.set_checked(boolValues[x]);
                                } else {
                                    value[Object.keys(value)[x]] = boolValues[x];
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.remove_style_class_name('label-enabled');
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.add_style_class_name('label-disabled');
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxEditorElement.actor.set_checked(boolValues[x]);
                                }
                            }, this);
                        };

                        // Check box
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement = new CheckBox('');
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.set_x_align(St.Align.MIDDLE);
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.actor.checked = value[subobjectKey];
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.actor.connect('clicked', () => { togglingFunction.call(this); });
                        if (!subObjectLabelOnly) this._propertyBoxes[i]._boolBox[n].add(this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.actor);
                        // Toggle when pressing anywhere in the label/checkbox parent BoxLayout
                        this._propertyBoxes[i]._boolBox[n].connect('button-press-event', () => { togglingFunction.call(this); });

                    }, this);
                } else if (Array.isArray(value)) {
                    //TO DO Array editor
                }

                if (!this._propertyBoxes[i]._propertyBoxEditorElement) return;
                if (this._propertyBoxes[i]._propertyBoxEditorElement.showIcon) {
                    this._propertyBoxes[i]._propertyBoxEditorElement.propertyBoxStElementIcon = new St.Icon({ icon_name: 'insert-object-symbolic', icon_size: 14, style_class: 'object-dialog-error-icon' });
                    if (this._propertyBoxes[i]._propertyBoxEditorElement.add) this._propertyBoxes[i]._propertyBoxEditorElement.add(this._propertyBoxes[i].propertyBoxStElementIcon, { y_align: St.Align.MIDDLE });
                }
            }, this);

        }

        this.open();    // Consider having this called from dialog instance origin to ease object reference workflow
        } catch(e) { dev.log(e); }
    }

    open() {
        this._errorBox.hide();
        this._inputError = false;
        super.open(global.get_current_time(), true);
        if (this._focusElement) this._focusElement.grab_key_focus();
    }
    close() {
        try {
        this._callback(this.returnObject);
        super.close();
        } catch(e) { dev.log(e); }
    }
    _checkInput(text) {
        this._inputError = false;
        if (text === '') this._showError("Input required");
    }
    _showError(message) {
        try {
        this._inputError = true;
        this._errorMessage.set_text(message);

        if (!this._errorBox.visible) {
            let [errorBoxMinHeight, errorBoxNaturalHeight] = this._errorBox.get_preferred_height(-1);
            let parentActor = this._errorBox.get_parent();
            parentActor.ease({ height: parentActor.height + errorBoxNaturalHeight, time: DIALOG_GROW_TIME, transition: 'easeOutQuad',
                               onComplete: () => {
                                   parentActor.set_height(-1);
                                   this._errorBox.show();
                               }
                             });
        }
        } catch (e) { dev.log(e);}
    }
});