/*
 * Worksets extension for Gnome 3
 * This file is part of the worksets extension for Gnome 3
 * Copyright (C) 2019 Anthony D - http://blipk.xyz
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

//External imports
const CheckBox  = imports.ui.checkBox.CheckBox;
const Clutter = imports.gi.Clutter;
const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Main = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const ShellEntry = imports.ui.shellEntry;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const _ = Gettext.domain('worksets').gettext;

//Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const utils = Me.imports.utils;
const fileUtils = Me.imports.fileUtils;
const debug = Me.imports.devUtils;
const scopeName = "uiUtils";


//For adding IconButtons on to PanelMenu.MenuItem buttons or elsewhere
function createIconButton (parentItem, iconNameURI, onClickFn, xexpand=false, yexpand=false, align = Clutter.ActorAlign.END) {
    let icon = new St.Icon({icon_name: iconNameURI, style_class: 'system-status-icon' });
    let iconButton = new St.Button({
        style_class: 'ci-action-btn', x_fill: true, can_focus: true,
        child: icon
    });
    iconButton.set_x_align(align);
    iconButton.set_x_expand(xexpand);
    iconButton.set_y_expand(yexpand);

    parentItem.actor.add_child(iconButton);
    parentItem.iconButtons.push(iconButton);
    parentItem.iconsButtonsPressIds.push( iconButton.connect('button-press-event', onClickFn) );
}

//Display a short overlay message on the screen for user feedback etc..
let text = [];
function hideUserFeedbackMessage(index) {
    Main.uiGroup.remove_actor(text[index]); text[index] = null;
}
function showUserFeedbackMessage(input, overviewMessage=false) {
    debug.log('User Feedback', input);

    if (overviewMessage) {
        Main.overview.setMessage(_(input), { forFeedback: true });
    } else {
        text.push(new St.Label({ style_class: 'feedback-label', text: _(input) }));
        let lastItem = text.length-1;
        Main.uiGroup.add_actor(text[lastItem]);
        text[lastItem].opacity = 255;
        let monitor = Main.layoutManager.primaryMonitor;
        text[lastItem].set_position(monitor.x + Math.floor(monitor.width / 2 - text[lastItem].width / 2), monitor.y + Math.floor(monitor.height / 2 - text[lastItem].height / 2));
        Tweener.addTween(text[lastItem], { opacity: 0, time: 2, transition: 'easeOutQuad', onComplete: hideUserFeedbackMessage[lastItem] });
    }

}


//Modal dialog popup based off runDialog that can display a message and/or get user input from a text box or from sets of JSObjects
const ObjectInterfaceDialog = new Lang.Class ({
    Name: 'Worksets.ObjectInterfaceDialog',
    Extends: ModalDialog.ModalDialog,

    _objectsSetBoxes: [],
    DIALOG_GROW_TIME: 0.1,

    _init: function(dialogText=null, callback=null, 
        showTextInput=true, disableTextInput=false, 
        jsobjectsSets=[], /*array of js objects or of strings to valid directories with .json files*/
        objectSetMasks=[{objectNameIdentifier: 'Object Set Display Name'}])
    {
        if (typeof dialogText === 'object') {
            this.parent(dialogText);
            return; 
        }

        if (typeof callback !== 'function')
            throw TypeError('ObjectInterfaceDialog._init error: callback must be a function');

        try{
        this.parent({ styleClass: 'object-dialog', destroyOnClose: false });
        //Label for our dialog/text field with text about the dialog or a prompt for user text input
        let stLabelUText = new St.Label({ style_class: 'object-dialog-label', text: _(dialogText) });
        this.contentLayout.add(stLabelUText, { x_fill: false, x_align: St.Align.START, y_align: St.Align.START });
        //Text field for user input
        let stEntryUText = new St.Entry({ style_class: 'object-dialog-label', can_focus: true, text: '' });
        this._stEntryUTextClutterText = stEntryUText.clutter_text;
        ShellEntry.addContextMenu(stEntryUText);
        stEntryUText.label_actor = stLabelUText;
        //Customisation
        stEntryUText.set_hint_text ("");
        if (typeof dialogText !== 'string') {stLabelUText.hide();}
        if (showTextInput !== true) {stEntryUText.hide()};
        if (disableTextInput !== true) {
            this.setInitialKeyFocus(this._stEntryUTextClutterText);
            this._stEntryUTextClutterText.set_selection(0, 0);
        } else {
            this._stEntryUTextClutterText.set_editable(false);
            this._stEntryUTextClutterText.set_selectable(false);
        }
        this.contentLayout.add(stEntryUText, { y_align: St.Align.START });

        //Error box that will appear to prompt for user validation of input
        this._errorBox = new St.BoxLayout({ style_class: 'object-dialog-error-box' });
        this.contentLayout.add(this._errorBox, { expand: true });
        let errorIcon = new St.Icon({ icon_name: 'dialog-error-symbolic', icon_size: 24, style_class: 'object-dialog-error-icon' });
        this._errorBox.add(errorIcon, { y_align: St.Align.MIDDLE });
        this._errorMessage = new St.Label({ style_class: 'object-dialog-error-label' });
        this._errorMessage.clutter_text.line_wrap = true;
        this._errorBox.add(this._errorMessage, { expand: true, x_align: St.Align.START, x_fill: false, y_align: St.Align.MIDDLE, y_fill: false });
        this._inputError = false;
        this._errorBox.hide();

        //Close button
        this.setButtons([{ action: this.close.bind(this), label: ("Close"), key: Clutter.Escape }]);
        
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
        if (jsobjectsSearchDirectories !== null && jsobjectsSearchDirectories !== undefined && jsobjectsSearchDirectories !== [] && jsobjectsSearchDirectories.length>0) {
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
            }, this);

            if(!jsobjectsSets[0]) {
                stLabelUText.set_text("No saved objects found on disk.");
                jsobjectsSets = undefined;
            }
        }

        if (jsobjectsSets) {
            //Build an area for each object set
            jsobjectsSets.forEach(function(objectSet, i){
                this._objectsSetBoxes[i] = new St.BoxLayout({ style_class: 'object-dialog-error-box' });
                this._objectsSetBoxes[i].objectSetBoxStIcon = new St.Icon({ icon_name: 'insert-object-symbolic', icon_size: 18, style_class: 'object-dialog-error-icon' });
                this._objectsSetBoxes[i].add(this._objectsSetBoxes[i].objectSetBoxStIcon, { y_align: St.Align.MIDDLE });
                this.contentLayout.add(this._objectsSetBoxes[i], { expand: true });

                this._objectsSetBoxes[i]._objectSetBoxMessage = new St.Label({ style_class: 'object-dialog-error-label' });
                this._objectsSetBoxes[i]._objectSetBoxMessage.clutter_text.line_wrap = true;
                this._objectsSetBoxes[i].add(this._objectsSetBoxes[i]._objectSetBoxMessage, { expand: true, x_align: St.Align.START, x_fill: false, y_align: St.Align.MIDDLE, y_fill: false });
                
                let setDisplayName = 'Object Set '+i;

                //Build area for each object
                this._objectsSetBoxes[i]._objectBoxes = [];
                objectSet.forEach(function(object, ii){
                    //Box base
                    this._objectsSetBoxes[i]._objectBoxes[ii] = new St.BoxLayout({ style_class: 'object-dialog-error-box' });  
                    //this._objectsSetBoxes[i]._objectBoxes[ii].set_vertical(true);
                    this._objectsSetBoxes[i].add(this._objectsSetBoxes[i]._objectBoxes[ii], { expand: true });

                    //State/type icon
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStIcon = new St.Icon({ icon_name: 'edit-select-symbolic', icon_size: 12, style_class: 'object-dialog-error-icon' });
                    this._objectsSetBoxes[i]._objectBoxes[ii].add(this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStIcon, { y_align: St.Align.MIDDLE });

                    //Labelled button to select the object
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton = new St.Button({
                        style_class: 'ci-action-btn', x_fill: true, can_focus: true,
                        child: this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStIcon
                    });
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.set_x_align(Clutter.ActorAlign.START); 
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.set_x_expand(false); 
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.set_y_expand(false);
                    this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.connect('button-press-event', ()=>{
                            this.popModal();
                            this.close();
                            callback(object);
                            return object;
                    });
                    this._objectsSetBoxes[i]._objectBoxes[ii].add(this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton, { y_align: St.Align.MIDDLE });
                    
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

                this._objectsSetBoxes[i]._objectSetBoxMessage.set_text(setDisplayName);
                if (setDisplayName.trim() === "") this._objectsSetBoxes[i].remove_actor(this._objectsSetBoxes[i].objectSetBoxStIcon);
            }, this);
        }

        //Handler for text input actions
        this._stEntryUTextClutterText.connect('activate', (o) => {
            this.popModal();
            this._checkInput(o.get_text());
            if (!this._inputError || !this.pushModal()) {
                callback(o.get_text());
                this.close();
                return o.get_text();
            }
            return o.get_text();
        });

        this.open();
    } catch(e) { debug.log(scopeName+'.'+arguments.callee.name, e); }
    },
    open: function() {
        this._errorBox.hide();
        this._inputError = false;
        this.parent(global.get_current_time(), true);
    },
    _checkInput: function(text) {
        this._inputError = false;
        
        if (text === '') {
            this._showError("Input required");
        }
    },
    _showError: function(message) {
        try {
        this._inputError = true;
        this._errorMessage.set_text(message);

        if (!this._errorBox.visible) {
            let [errorBoxMinHeight, errorBoxNaturalHeight] = this._errorBox.get_preferred_height(-1);
            let parentActor = this._errorBox.get_parent();
            Tweener.addTween(parentActor,
                             { height: parentActor.height + errorBoxNaturalHeight, time: DIALOG_GROW_TIME, transition: 'easeOutQuad',
                               onComplete: () => {
                                   parentActor.set_height(-1);
                                   this._errorBox.show();
                               }
                             });
        }
        } catch (e) {logError(e); debug.log(e);}
    }
});


//Object Editor Dialog
const ObjectEditorDialog = new Lang.Class ({
    Name: 'Worksets.ObjectEditorDialog',
    Extends: ObjectInterfaceDialog,

    _propertyBoxes: [],
    _callback: null,

    _init: function(dialogText=null, callback=null, 
        jsobject=null, /*object to edit in the editor */
        propertyMasks=[{propertyName: 'Property Display Name', disabled: false, hidden: false}])
    {
        if (typeof callback !== 'function')
            throw TypeError('ObjectEditorDialog._init error: callback must be a function');

        this._callback = callback;
        try{
        this.parent({ styleClass: 'object-dialog', destroyOnClose: false });

        //Label for our dialog/text field with text about the dialog or a prompt for user text input
        let stLabelUText = new St.Label({ style_class: 'object-dialog-label', text: _(dialogText) });
        this.contentLayout.add(stLabelUText, { x_fill: false, x_align: St.Align.START, y_align: St.Align.START });

        //Error box that will appear to prompt for user validation of input
        this._errorBox = new St.BoxLayout({ style_class: 'object-dialog-error-box' });
        this.contentLayout.add(this._errorBox, { expand: true });
        let errorIcon = new St.Icon({ icon_name: 'dialog-error-symbolic', icon_size: 24, style_class: 'object-dialog-error-icon' });
        this._errorBox.add(errorIcon, { y_align: St.Align.MIDDLE });
        this._inputError = false;
        this._errorMessage = new St.Label({ style_class: 'object-dialog-error-label' });
        this._errorMessage.clutter_text.line_wrap = true;
        this._errorBox.add(this._errorMessage, { expand: true, x_align: St.Align.START, x_fill: false, y_align: St.Align.MIDDLE, y_fill: false });
        this._errorBox.hide();

        //Action buttons
        this.setButtons([{ action: this.close.bind(this), label: ("Close"), key: Clutter.Escape }]);
        
        if (jsobject[1]) {throw TypeError('Multiple objects passed to object editor, only one supported.');}
        if (jsobject[0]) {jsobject=jsobject[0];}
        
        if (jsobject) {
            //this._originalObject = JSON.parse(JSON.stringify(jsobject));
            //Create an area for each property of our object
            this._propertyBoxes = [];
            jsobject.forEachEntry(function(key, value, i){
                //debug.log("key: "+key+" | value:"+value+" | value type:"+ (typeof value) +" | entry index "+i);

                let propertyDisplayName = key;
                let propertyDisabled = true;
                let propertyHidden = true;
                propertyMasks.forEach(function(propertyMask, index) {
                    if (propertyMasks[index][key]) {
                        propertyDisplayName = propertyMasks[index][key];
                        propertyDisabled = propertyMasks[index].disabled;
                        propertyHidden = propertyMasks[index].hidden;
                    }
                }, this);
                if (propertyHidden) return;

                //A box area for each property
                this._propertyBoxes[i] = new St.BoxLayout({ style_class: 'object-dialog-error-box' });
                this._propertyBoxes[i].propertyBoxStIcon = new St.Icon({ icon_name: 'insert-object-symbolic', icon_size: 18, style_class: 'object-dialog-error-icon' });
                this._propertyBoxes[i].add(this._propertyBoxes[i].propertyBoxStIcon, { y_align: St.Align.MIDDLE });
                this.contentLayout.add(this._propertyBoxes[i], { expand: true });

                this._propertyBoxes[i]._propertyBoxMessage = new St.Label({ style_class: 'object-dialog-error-label' });
                this._propertyBoxes[i]._propertyBoxMessage.clutter_text.line_wrap = true;
                this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxMessage, { expand: true, x_align: St.Align.START, x_fill: false, y_align: St.Align.MIDDLE, y_fill: false });
                this._propertyBoxes[i]._propertyBoxMessage.set_text(propertyDisplayName);

                //Property value editor element
                //if (value === undefined) {value = 'empty'};
                //if (value === null) {value = 'empty'};
                if (typeof value === 'boolean') {
                    this._propertyBoxes[i]._propertyBoxEditorElement = new CheckBox('');
                    this._propertyBoxes[i]._propertyBoxEditorElement.actor.checked = jsobject[key];
                    this._propertyBoxes[i]._propertyBoxEditorElement.actor.connect('clicked', () => {jsobject[key] = this._propertyBoxes[i]._propertyBoxEditorElement.actor.checked});
                    this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxEditorElement.actor);
                }
                if (typeof value === 'string' || typeof value === 'number') {
                    this._propertyBoxes[i]._propertyBoxEditorElement = new St.Entry({ style_class: 'object-dialog-label', can_focus: true, text: '' });
                    this._propertyBoxes[i]._propertyBoxEditorElement._elementClutterText = this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text;
                    if (propertyDisabled === true) {
                        this._propertyBoxes[i]._propertyBoxEditorElement._elementClutterText.set_editable(false);
                        this._propertyBoxes[i]._propertyBoxEditorElement._elementClutterText.set_selectable(false);
                        this._propertyBoxes[i]._propertyBoxEditorElement._elementClutterText.set_max_length(value.length);   
                    }
                    this._propertyBoxes[i]._propertyBoxEditorElement.set_text(value.toString());
                    this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxEditorElement, { y_align: St.Align.END });
                    
                    this._propertyBoxes[i]._propertyBoxEditorElement._elementClutterText.get_buffer().connect('inserted-text', (o, position, new_text, new_text_length, e) => {
                        if (typeof value === 'number') {
                            if (new_text.search(/^[0-9]+$/i) === -1) {
                                o.delete_text(position, new_text_length);
                                return Clutter.EVENT_STOP;
                            }
                        } 
                        return Clutter.EVENT_PROPAGATE;
                    });

                    this._propertyBoxes[i]._propertyBoxEditorElement._elementClutterText.connect('text-changed', (o, e) => {
                        if (typeof value === 'number') {
                            jsobject[key] = parseInt(o.get_text());
                        } else {
                            jsobject[key] = o.get_text();
                        }
                        return Clutter.EVENT_PROPAGATE;
                    });
                }
                //TO DO
                if (Array.isArray(value)) {
                    if (typeof value === 'object') {
                        //Labelled button to select the object to open it in another editor
                        this._propertyBoxes[i]._propertyBoxEditorElement = new St.Button({
                            style_class: 'ci-action-btn', x_fill: true, can_focus: true
                        });
                        this._propertyBoxes[i]._propertyBoxEditorElement.set_x_align(Clutter.ActorAlign.END); 
                        this._propertyBoxes[i]._propertyBoxEditorElement.set_x_expand(false); 
                        this._propertyBoxes[i]._propertyBoxEditorElement.set_y_expand(false);
                        this._propertyBoxes[i]._propertyBoxEditorElement.connect('button-press-event', ()=>{
                                this.popModal();
                                callback(object);
                                this.close();
                                return object;
                        });
                        this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxEditorElement, { y_align: St.Align.END });
                        this._propertyBoxes[i]._propertyBoxEditorElement.set_label(value.toString());
                    } else {
                        //String array list editor
                        //Other array subtype editors
                    }
                }
            }, this);

        }

        this.open();
    } catch(e) { debug.log(scopeName+'.'+arguments.callee.name, e); }
    },
    close: function() {
        try {
        this._callback();
        this.parent();
        } catch(e) { debug.log(scopeName+'.'+arguments.callee.name, e); }
    }
});