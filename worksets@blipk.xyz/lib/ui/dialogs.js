// External imports
import St from "gi://St"
import Gio from "gi://Gio"
import GObject from "gi://GObject"
import Clutter from "gi://Clutter"

import * as util from "resource:///org/gnome/shell/misc/util.js"
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js"

import * as CheckBox from "resource:///org/gnome/shell/ui/checkBox.js"
import * as modalDialog from "resource:///org/gnome/shell/ui/modalDialog.js"
import * as shellEntry from "resource:///org/gnome/shell/ui/shellEntry.js"

// Internal imports
import * as dev from "../../dev.js"
import * as utils from "../../utils.js"
import * as fileUtils from "../../fileUtils.js"
import * as uiUtils from "./uiUtils.js"


//Modal dialog popup based off runDialog that can display a message and/or get user input from a text box or from sets of JSObjects
//Object Interfacer Dialog
export var ObjectInterfaceDialog = GObject.registerClass( {
    GTypeName: "Worksets_ObjectInterfaceDialog"
}, class ObjectInterfaceDialog extends modalDialog.ModalDialog {
    _init(
        dialogText = null, callback = null,
        showTextInput = true, disableTextInput = false,
        jsobjectsSets = [], /*array of js objects or of strings to valid directories with .json files*/
        objectSetMasks = [{ objectNameIdentifier: "Object Set Display Name" }],
        buttons = null,
        defaultText = ""
    ) {

        if ( typeof dialogText === "object" ) {
            super._init( dialogText )
            return
        }

        this._objectsSetBoxes = []
        this.DIALOG_GROW_TIME = 0.1
        this._callback = null
        this._confirmed = false

        if ( typeof callback !== "function" ) throw TypeError( "ObjectInterfaceDialog._init error: callback must be a function" )
        this._callback = callback

        try {
            super._init( { styleClass: "object-dialog", destroyOnClose: false } )
            //Label for our dialog/text field with text about the dialog or a prompt for user text input
            let stLabelUText = new St.Label( { style_class: "object-dialog-label", text: _( dialogText ) } )
            let headerLabelArea = new St.BoxLayout()
            headerLabelArea.add_child( stLabelUText )

            //Text field for user input
            this.stEntryUText = new St.Entry( { style_class: "object-dialog-label", can_focus: true, text: defaultText } )
            shellEntry.addContextMenu( this.stEntryUText )
            this.stEntryUText.label_actor = stLabelUText
            //Customisation
            this.stEntryUText.set_hint_text( "" )
            if ( typeof dialogText !== "string" ) { stLabelUText.hide() }
            if ( showTextInput !== true ) { this.stEntryUText.hide() }
            if ( disableTextInput !== true ) {
                this.setInitialKeyFocus( this.stEntryUText.clutter_text )
                this.stEntryUText.clutter_text.set_selection( 0, 0 )
            } else {
                this.stEntryUText.clutter_text.set_editable( false )
                this.stEntryUText.clutter_text.set_selectable( false )
            }

            //Error box that will appear to prompt for user validation of input
            this._errorBox = new St.BoxLayout( { style_class: "object-dialog-error-box" } )
            this.contentLayout.add_child( this._errorBox )
            let errorIcon = new St.Icon( { icon_name: "dialog-error-symbolic", icon_size: 24, style_class: "object-dialog-error-icon" } )
            this._errorBox.add_child( errorIcon )
            this._errorMessage = new St.Label( { style_class: "object-dialog-error-label" } )
            this._errorMessage.clutter_text.line_wrap = true
            this._errorBox.add_child( this._errorMessage )
            this._inputError = false
            this._errorBox.hide()

            //Action buttons
            this.buttons = Array()
            buttons = ( buttons == null ) ? "Done" : buttons
            let defaults = [{ label: ( buttons ), default: true }] //key: Clutter.KEY_Escape
            buttons = ( typeof buttons == "string" ) ? defaults : buttons
            buttons.forEach( function ( button, i ) {
                if ( button.action ) button.action = button.action.bind( this )
                else if ( button.default ) button.action = () => { this._confirmed = true; this.close() }
                else button.action = () => { this.close() }

                this.buttons[i] = this.addButton( button )
                this.buttons[i].set_reactive( true )
                if ( button.style_class ) this.buttons[i].add_style_class_name( button.style_class )
            }, this )

            // Directories
            let jsobjectsSearchDirectories = null
            if ( typeof jsobjectsSets[0] === "string" ) {
                let directoryFile = Gio.file_new_for_path( jsobjectsSets[0] )
                if ( directoryFile.query_exists( null ) ) {
                    jsobjectsSearchDirectories = jsobjectsSets
                } else {
                    stLabelUText.set_text( "No saved objects found on disk." )
                    jsobjectsSets = undefined
                }
            }

            //Build objects in jsobjectSets from .json files in directory (or multiple - one objectSet of objects per directory)
            if ( !utils.isEmpty( jsobjectsSearchDirectories ) ) {
                jsobjectsSets = []
                jsobjectsSearchDirectories.forEach( function ( directory, i ) {
                    let childrenFilePropertiesArray = fileUtils.enumarateDirectoryChildren( directory )
                    let tmpObjectsSet = []
                    childrenFilePropertiesArray.forEach( function ( fileProperties, ii ) {
                        if ( fileProperties.extension === "json" ) {
                            let objectFromDirectoryFile = fileUtils.loadJSObjectFromFile( fileProperties.fullname, directory )
                            tmpObjectsSet.push( objectFromDirectoryFile )
                        }
                    }, this )
                    if ( tmpObjectsSet[0] ) {
                        jsobjectsSets.push( tmpObjectsSet )
                    }

                    let btn = uiUtils.createIconButton(
                        headerLabelArea, "document-open-symbolic",
                        () => {
                            this.close()
                            util.spawn( ["xdg-open",jsobjectsSearchDirectories[0]] )
                            btn.destroy()
                        },
                        { icon_size: 20, style_class: "open-backups-icon" },
                        {
                            leaveFadeTime : 0.7, disappearTime : 4400, delay         : 400,
                            force         : true, msg           : "Open folder to manage backups (" + jsobjectsSearchDirectories[0] + ")"
                        }
                    )
                }, this )

                if ( !jsobjectsSets[0] ) {
                    stLabelUText.set_text( "No saved objects found on disk." )
                    jsobjectsSets = undefined
                }
            }

            this.contentLayout.add_child( headerLabelArea )
            this.contentLayout.add_child( this.stEntryUText )

            if ( jsobjectsSets ) {
                //Build an area for each object set
                jsobjectsSets.forEach( function ( objectSet, i ) {
                    this._objectsSetBoxes[i] = new St.BoxLayout(
                        { style_class: "object-dialog-error-box", y_expand: true, x_expand: true, x_align: Clutter.ActorAlign.CENTER }
                    )

                    Array( this._objectsSetBoxes[i] ).map( b => {
                        b.objectSetBoxStIcon = new St.Icon(
                            { icon_name: "insert-object-symbolic", icon_size: 18, style_class: "object-dialog-error-icon" }
                        )
                        //b.add_child(this._objectsSetBoxes[i].objectSetBoxStIcon, { y_align: Clutter.ActorAlign.CENTER });
                        this.contentLayout.add_child( b )

                        b._objectSetBoxMessage = new St.Label( { style_class: "object-dialog-backup-file-label" } )
                        b._objectSetBoxMessage.clutter_text.line_wrap = true
                        return b
                    } )

                    //Build area for each object
                    let count = 0
                    this._objectsSetBoxes[i]._objectBoxes = []
                    let setDisplayName = "Object Set " + i
                    objectSet.forEach( function ( object, ii ) {
                        // Create a new line if there are too many objects
                        if ( count == 4 ) {
                            i++
                            count = 0
                            this._objectsSetBoxes[i] = new St.BoxLayout(
                                { style_class: "object-dialog-error-box", y_expand: true, x_expand: true, x_align: Clutter.ActorAlign.CENTER }
                            )
                            this.contentLayout.add_child( this._objectsSetBoxes[i] )
                            this._objectsSetBoxes[i]._objectBoxes = []
                        }
                        count++

                        //Box base
                        this._objectsSetBoxes[i]._objectBoxes[ii] = new St.BoxLayout( { style_class: "object-dialog-item" } )
                        //this._objectsSetBoxes[i]._objectBoxes[ii].set_vertical(true);
                        this._objectsSetBoxes[i].add_child( this._objectsSetBoxes[i]._objectBoxes[ii] )
                        Array( this._objectsSetBoxes[i]._objectBoxes[ii] ).map( b => {
                            //State/type icon
                            b._objectBoxStIcon = new St.Icon(
                                { icon_name: "insert-object-symbolic", icon_size: 14, style_class: "object-dialog-item-icon" }
                            )
                            b.add_child( this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStIcon )
                            //Labelled button to select the object
                            b._objectBoxStButton = new St.Button( {
                                style_class : "ci-action-btn", x_align     : Clutter.ActorAlign.FILL, can_focus   : true,
                                child       : this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStIcon
                            } )

                            b._objectBoxStButton.set_x_align( Clutter.ActorAlign.START )
                            b._objectBoxStButton.set_x_expand( false )
                            b._objectBoxStButton.set_y_expand( false )
                            b._objectBoxStButton.connect( "button-press-event", () => {
                                this.popModal(); this._confirmed = true; this.close( object ); return object
                            } )

                            b.add_child( this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton )
                        } )

                        // Object labels
                        let objectDisplayName = "Object " + ii
                        Object.keys( object ).forEach( function ( objectkey, objectkeyIndex ) {
                            objectSetMasks.forEach( function ( objectMask, objectMaskIndex ) {
                                if ( objectSetMasks[objectMaskIndex][objectkey] ) {
                                    objectDisplayName = object[objectkey]
                                    setDisplayName = objectSetMasks[objectMaskIndex][objectkey]
                                }
                            }, this )
                        }, this )
                        this._objectsSetBoxes[i]._objectBoxes[ii]._objectBoxStButton.set_label( objectDisplayName )
                    }, this )

                    if ( this._objectsSetBoxes[i]._objectSetBoxMessage ) this._objectsSetBoxes[i]._objectSetBoxMessage.set_text( setDisplayName )
                    if ( setDisplayName.trim() === "" ) this._objectsSetBoxes[i].remove_child( this._objectsSetBoxes[i].objectSetBoxStIcon )
                }, this )
            }

            //Handler for text input actions
            this.stEntryUText.clutter_text.connect( "activate", ( o ) => {
                this.popModal()
                this._checkInput( o.get_text() )
                if ( !this._inputError || !this.pushModal() ) {
                    this.popModal()
                    this._confirmed = true
                    this.close( o.get_text() )
                    return o.get_text()
                }
                return o.get_text()
            } )

            this.open()
        } catch ( e ) { dev.log( e ) }
    }
    open() {
        this._errorBox.hide()
        this._inputError = false
        super.open( global.get_current_time(), true )
    }
    close( returnObject ) {
        try {
            if ( this._confirmed )
                this._callback( returnObject || this.stEntryUText.clutter_text.get_text() )
            this._confirmed = false
            super.close()
        } catch ( e ) { dev.log( e ) }
    }
    _checkInput( text ) {
        this._inputError = false

        if ( text === "" ) {
            this._showError( "Input required" )
        }
    }
    _showError( message ) {
        try {
            this._inputError = true
            this._errorMessage.set_text( message )

            if ( !this._errorBox.visible ) {
                let [errorBoxMinHeight,
                    errorBoxNaturalHeight] = this._errorBox.get_preferred_height( -1 )
                let parentActor = this._errorBox.get_parent()
                parentActor.ease( {
                    height     : parentActor.height + errorBoxNaturalHeight, time       : this.DIALOG_GROW_TIME, transition : "easeOutQuad",
                    onComplete : () => {
                        parentActor.set_height( -1 )
                        this._errorBox.show()
                    }
                } )
            }
        } catch ( e ) { dev.log( e ) }
    }
} )

//Object Editor Dialog
export var ObjectEditorDialog = GObject.registerClass( {
    GTypeName: "Worksets_ObjectEditorDialog"
}, class ObjectEditorDialog extends modalDialog.ModalDialog {
    _init(
        dialogInfoTextStyle = "", callback = null,
        editableObject = null, /*object to edit in the editor */
        editableProperties = [], /* {propertyName: 'Property Display Name', disabled: false, hidden: false, subObjectEditableProperties: editableProperties,  icon: icon-name, hintText: 'Hint text to display for St.Entry', minwidth: 20, subObjectEditableProperties=[]}*/
        buttons = null,
        dialogStyle = null,
        contentLayoutBoxStyleClass = ""
    ) {

        if ( typeof callback !== "function" ) throw TypeError( "ObjectEditorDialog._init error: callback must be a function" )
        this._callback = callback

        if ( editableObject[1] ) { throw TypeError( "Array passed to object editor, only supports objects with simple types or sub objects as simple bool/int enums." ) }
        this.returnObject = editableObject
        this.editableObject = editableObject
        this._unreferencedObjectCopy = JSON.parse( JSON.stringify( editableObject ) )


        try {
            // Initialize dialog with style
            let defaults = { styleClass: "object-dialog", destroyOnClose: true }
            dialogStyle = { ...defaults, ...dialogStyle }
            super._init( dialogStyle )
            this.contentLayout.style_class = contentLayoutBoxStyleClass ? contentLayoutBoxStyleClass : this.contentLayout.style_class

            //Label for our dialog/text field with text about the dialog or a prompt for user text input
            defaults = {
                style_class : "object-dialog-label",
                text        : _( ( dialogInfoTextStyle.text || dialogInfoTextStyle ).toString() ),
                x_align     : Clutter.ActorAlign.START, y_align     : Clutter.ActorAlign.START
            }
            dialogInfoTextStyle = ( typeof dialogInfoTextStyle == "string" ) ? defaults : { ...defaults, ...dialogInfoTextStyle }
            let stLabelUText = new St.Label( dialogInfoTextStyle )

            dialogInfoTextStyle.x_align = Clutter.ActorAlign.FILL
            if ( dialogInfoTextStyle.text != "" ) this.contentLayout.add_child( stLabelUText )


            //*Error box that will appear to prompt for user validation of input //TO DO
            this._errorBox = new St.BoxLayout()
            this.contentLayout.add_child( this._errorBox )
            let errorIcon = new St.Icon( { icon_name: "dialog-error-symbolic", icon_size: 24, style_class: "object-dialog-error-icon" } )
            this._errorBox.add_child( errorIcon )
            this._inputError = false
            this._errorMessage = new St.Label( { style_class: "object-dialog-error-label" } )
            this._errorMessage.clutter_text.line_wrap = true
            this._errorBox.add_child( this._errorMessage )
            this._errorBox.hide()

            //Action buttons
            this.buttons = Array()
            buttons = ( buttons == null ) ? "Done" : buttons
            defaults = [{ label: ( buttons ), default: true }] //key: Clutter.KEY_Escape
            buttons = ( typeof buttons == "string" ) ? defaults : buttons
            buttons.forEach( function ( button, i ) {
                if ( button.action ) button.action = button.action.bind( this )
                else button.action = this.close.bind( this )

                this.buttons[i] = this.addButton( button )
                this.buttons[i].set_reactive( true )
                if ( button.style_class ) this.buttons[i].add_style_class_name( button.style_class )
            }, this )

            //Create an area for each property of our object
            this._propertyBoxes = []
            this.propertyKeys = Array()
            this.propertyValues = Array()

            this.propertyDisplayName = Array()
            this.propertyDisabled = Array()
            this.propertyHidden = Array()
            this.propertyLabelOnly = Array()
            this.propertyLabelStyle = Array()
            this.propertyBoxStyle = Array()
            this.propertyIconStyle = Array()
            this.subObjectMasks = Array()
            this.propertyBoxClickCallbacks = Array()
            if ( editableObject ) {
                utils.forEachEntry( editableObject, function ( key, value, i ) {
                    // Options for how to display each property section
                    this.propertyKeys[i] = key
                    this.propertyValues[i] = value
                    this.propertyDisplayName[i] = ""
                    this.propertyDisabled[i] = false
                    this.propertyHidden[i] = false
                    this.propertyLabelOnly[i] = false
                    this.propertyLabelStyle[i] = {
                        style_class : "spacing7",
                        x_expand    : true, y_expand    : true,
                        x_align     : Clutter.ActorAlign.END, y_align     : Clutter.ActorAlign.CENTER
                    }
                    this.propertyBoxStyle[i] = {}
                    this.propertyIconStyle[i] = {}
                    this.subObjectMasks[i] = []
                    this.propertyBoxClickCallbacks[i] = ( () => { dev.log( "Clicked on " + this.propertyDisplayName[i] ) } )
                    editableProperties.forEach( function ( propertyDisplayOption, index ) {
                        if ( editableProperties[index][key] ) {
                            this.propertyDisplayName[i] = editableProperties[index][key] || this.propertyDisplayName[i]

                            let {
                                disabled, hidden,
                                labelOnly, labelStyle,
                                boxStyle, iconStyle,
                                subObjectEditableProperties, boxClickCallback
                            } = editableProperties[index]
                            this.propertyDisabled[i] = disabled || this.propertyDisabled[i]
                            this.propertyHidden[i] = hidden || this.propertyHidden[i]
                            this.propertyLabelOnly[i] = labelOnly || this.propertyLabelOnly[i]
                            this.propertyLabelStyle[i] = labelStyle || this.propertyLabelStyle[i]
                            this.propertyBoxStyle[i] = boxStyle || this.propertyBoxStyle[i]
                            this.propertyIconStyle[i] = iconStyle || this.propertyIconStyle[i]
                            this.subObjectMasks[i] = subObjectEditableProperties || this.subObjectMasks[i]
                            this.propertyBoxClickCallbacks[i] =
                                boxClickCallback || ( () => { dev.log( "Clicked on " + this.propertyDisplayName[i] ) } )
                        }
                    }, this )
                    if ( utils.isEmpty( this.propertyDisplayName[i] ) ) return
                    if ( this.propertyHidden[i] ) return
                    if ( value === undefined ) return
                    if ( value === null ) return

                    //A box area for each property
                    this._propertyBoxes[i] = new St.BoxLayout( this.propertyBoxStyle[i] )
                    if ( this.propertyIconStyle[i] != undefined && this.propertyIconStyle[i] != {} ) {
                        this._propertyBoxes[i].propertyBoxStNameIcon = new St.Icon( this.propertyIconStyle[i] )
                        this._propertyBoxes[i].add_child( this._propertyBoxes[i].propertyBoxStNameIcon, this.propertyIconStyle[i] )
                    }

                    Array( this._propertyBoxes[i] ).map( b => {
                        // :hover event doesn't work on style_class elements for BoxLayout, this allows using :focus for hover events
                        b.connect( "enter-event", () => { b.grab_key_focus() } )
                        b.connect( "leave-event", () => { global.stage.set_key_focus( this ) } )
                        b.connect( "button-press-event", () => {
                            this.propertyBoxClickCallbacks[i].call( this, i )
                        } )

                        // Left side labelled button
                        b._propertyBoxMessageButton = new St.Button( this.propertyLabelStyle[i] )
                        b._propertyBoxMessage = new St.Label( this.propertyLabelStyle[i] )
                        b._propertyBoxMessage.set_text( this.propertyDisplayName[i] )
                        b._propertyBoxMessage.clutter_text.line_wrap = false
                        b._propertyBoxMessageButton.add_child( b._propertyBoxMessage )
                        //b._propertyBoxMessageButton.set_label(this.propertyDisplayName[i])
                        //b._propertyBoxMessageButton.set_label_actor(b._propertyBoxMessage.actor)
                        b._propertyBoxMessageButton.connect( "button-press-event", () => {
                            this.propertyBoxClickCallbacks[i].call( this, i )
                        } )
                        b.add_child( b._propertyBoxMessageButton )
                        return b
                    } )
                    // this.contentLayout.add_child( this._propertyBoxes[i], this.propertyBoxStyle[i] )
                    this.contentLayout.add_child( this._propertyBoxes[i] )


                    //Property value editor element
                    if ( this.propertyLabelOnly[i] ) return
                    if ( typeof value === "boolean" ) {
                        this._propertyBoxes[i]._propertyBoxEditorElement = new CheckBox.CheckBox( "" )
                        Array( this._propertyBoxes[i]._propertyBoxEditorElement ).map( b => {
                            b.set_checked( editableObject[key] )
                            b.connect(
                                "clicked", () => {
                                    editableObject[key] = this._propertyBoxes[i]._propertyBoxEditorElement.get_checked()
                                }
                            )
                        } )
                        this._propertyBoxes[i].add_child( this._propertyBoxes[i]._propertyBoxEditorElement )
                    } else if ( typeof value === "string" || typeof value === "number" ) {
                        this._propertyBoxes[i]._propertyBoxEditorElement = new St.Entry(
                            { style_class: "object-dialog-label", can_focus: true, text: "", x_align: Clutter.ActorAlign.FILL, x_expand: true }
                        )
                        Array( this._propertyBoxes[i]._propertyBoxEditorElement ).map( b => {
                            b.clutter_text.min_width = 200
                            this._focusElement = b // To set initial focus
                            if ( this.propertyDisabled[i] === true ) {
                                b.clutter_text.set_editable( false )
                                b.clutter_text.set_selectable( false )
                                b.clutter_text.set_max_length( value.length )
                            }
                            b.set_text( value.toString() )

                            b.clutter_text.get_buffer().connect(
                                "inserted-text",
                                ( o, position, new_text, new_text_length, e ) => {
                                    if ( typeof value !== "number" ) return Clutter.EVENT_PROPAGATE
                                    if ( new_text.search( /^[0-9]+$/i ) === -1 ) {
                                        o.delete_text( position, new_text_length )
                                        return Clutter.EVENT_STOP
                                    }
                                    return Clutter.EVENT_PROPAGATE
                                }
                            )
                            b.clutter_text.connect( "text-changed", ( o, e ) => {
                                if ( typeof value === "number" ) editableObject[key] = parseInt( o.get_text() )
                                else editableObject[key] = o.get_text()
                                return Clutter.EVENT_PROPAGATE
                            } )
                            return b
                        } )
                        this._propertyBoxes[i].add_child( this._propertyBoxes[i]._propertyBoxEditorElement )

                    } else if ( typeof value === "object" && !Array.isArray( value ) ) {
                        // Any grouped sub objects must all be boolean (or TO DO int types)
                        // They will be displaye horizontally with labels above them

                        // Check for valid types in the sub object
                        let containsBooleans = true
                        utils.forEachEntry( value, function ( subobjectKey, subobjectValue, i ) {
                            if ( typeof subobjectValue != "boolean" ) containsBooleans = false
                        }, this )
                        if ( !containsBooleans ) return

                        // Build UI
                        this._propertyBoxes[i]._boolBox = Array()
                        utils.forEachEntry( value, function ( subobjectKey, subobjectValue, n ) {
                            // Set up display masks for the subobject properties
                            let subObjectPropertyDisplayName = key
                            let subObjectPropertyDisabled = false // TODO
                            let subObjectPropertyHidden = false
                            let subObjectLabelOnly = false
                            let subObjectToggleValidationCallback = ( () => { return [true] } )
                            this.subObjectMasks[i].forEach( function ( propertyMask, index ) {
                                if ( this.subObjectMasks[i][index][subobjectKey] ) {
                                    subObjectPropertyDisplayName = this.subObjectMasks[i][index][subobjectKey] || subObjectPropertyDisplayName
                                    subObjectPropertyDisabled = this.subObjectMasks[i][index].disabled || subObjectPropertyDisabled
                                    subObjectPropertyHidden = this.subObjectMasks[i][index].hidden || false
                                    subObjectLabelOnly = this.subObjectMasks[i][index].labelOnly || subObjectLabelOnly
                                    subObjectToggleValidationCallback =
                                        this.subObjectMasks[i][index].toggleValidationCallback || subObjectToggleValidationCallback
                                }
                            }, this )
                            if ( subObjectPropertyHidden ) return

                            //Vertical box area for each subobject property
                            this._propertyBoxes[i]._boolBox[n] = new St.BoxLayout( {
                                orientation : Clutter.Orientation.VERTICAL,
                                reactive    : true,
                                track_hover : true,
                                x_expand    : true,
                                y_expand    : true,
                                x_align     : Clutter.ActorAlign.FILL,
                                y_align     : Clutter.ActorAlign.FILL
                            } )
                            Array( this._propertyBoxes[i]._boolBox[n] ).map( b => {
                                // Label
                                b._boolBoxMessage = new St.Label()
                                value[subobjectKey] ? b._boolBoxMessage.set_style_class_name( "label-enabled" ) :
                                    b._boolBoxMessage.add_style_class_name( "label-disabled" )

                                b._boolBoxMessage.add_style_class_name( "uri-element-label" )
                                //b._boolBoxMessage.clutter_text.set_line_wrap(false);
                                b.add_child( b._boolBoxMessage )
                                b._boolBoxMessage.set_text( subObjectPropertyDisplayName )

                                // Check box
                                b._boolBoxEditorElement = new CheckBox.CheckBox( "" )
                                b._boolBoxEditorElement.set_x_align( Clutter.ActorAlign.CENTER )
                                b._boolBoxEditorElement.set_checked( value[subobjectKey] )
                                b._boolBoxEditorElement.connect(
                                    "clicked", () => { togglingFunction.call( this ) }
                                )
                                if ( !subObjectLabelOnly )
                                    b.add_child(
                                        b._boolBoxEditorElement
                                    )
                                // Make label clickable to toggle the checkbox
                                b._boolBoxMessage.reactive = true
                                b._boolBoxMessage.connect( "button-press-event", () => {
                                    // Programmatically click the checkbox to trigger its toggle
                                    b._boolBoxEditorElement.emit( "clicked" )
                                    return Clutter.EVENT_STOP
                                } )

                                return b
                            } )
                            this._propertyBoxes[i].add_child( this._propertyBoxes[i]._boolBox[n] )
                            //, { expand: true, reactive: true, track_hover: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL }

                            // Toggling Function used for boolean checkboxes
                            function togglingFunction() {
                                // Get the checkbox's current state (after auto-toggle)
                                const newCheckedState = this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.get_checked()

                                // Create proposed state array with the new value
                                let proposedBoolValues = Object.values( value )
                                proposedBoolValues[n] = newCheckedState

                                // Run validation callback
                                let [allowed, validatedBoolValues] = subObjectToggleValidationCallback.call( this, value, n )

                                // Determine final values: use validated values if provided, otherwise use proposed values
                                let finalBoolValues = validatedBoolValues || proposedBoolValues

                                // If not allowed, revert to original state
                                if ( !allowed ) {
                                    finalBoolValues[n] = value[subobjectKey]
                                }

                                // Update all checkboxes and data model to match final state
                                this._propertyBoxes[i]._boolBox.forEach( ( _box, x ) => {
                                    const key = Object.keys( value )[x]
                                    value[key] = finalBoolValues[x]

                                    if ( finalBoolValues[x] ) {
                                        this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.remove_style_class_name( "label-disabled" )
                                        this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.add_style_class_name( "label-enabled" )
                                    } else {
                                        this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.remove_style_class_name( "label-enabled" )
                                        this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.add_style_class_name( "label-disabled" )
                                    }
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxEditorElement.set_checked( finalBoolValues[x] )
                                } )
                            }

                        }, this )
                    } else if ( Array.isArray( value ) ) {
                        //TO DO Array editor
                    }

                    if ( !this._propertyBoxes[i]._propertyBoxEditorElement ) return
                    if ( this._propertyBoxes[i]._propertyBoxEditorElement.showIcon ) {
                        this._propertyBoxes[i]._propertyBoxEditorElement.propertyBoxStElementIcon = new St.Icon(
                            { icon_name: "insert-object-symbolic", icon_size: 14, style_class: "object-dialog-error-icon" }
                        )
                        if ( this._propertyBoxes[i]._propertyBoxEditorElement.add ) {
                            this._propertyBoxes[i]._propertyBoxEditorElement.add_child(
                                this._propertyBoxes[i].propertyBoxStElementIcon, { y_align: Clutter.ActorAlign.CENTER }
                            )
                        }
                    }
                }, this )
            }
            this.open() // Consider having this called from dialog instance origin to ease object reference workflow
        } catch ( e ) { dev.log( e ) }
    }

    open() {
        this._errorBox.hide()
        this._inputError = false
        super.open( global.get_current_time(), true )
        if ( this._focusElement ) this._focusElement.grab_key_focus()
    }
    close() {
        try {
            this._callback( this.returnObject )
            super.close()
        } catch ( e ) { dev.log( e ) }
    }
    _checkInput( text ) {
        this._inputError = false
        if ( text === "" ) this._showError( "Input required" )
    }
    _showError( message ) {
        try {
            this._inputError = true
            this._errorMessage.set_text( message )

            if ( !this._errorBox.visible ) {
                let [errorBoxMinHeight, errorBoxNaturalHeight] = this._errorBox.get_preferred_height( -1 )
                let parentActor = this._errorBox.get_parent()
                parentActor.ease( {
                    height     : parentActor.height + errorBoxNaturalHeight, time       : DIALOG_GROW_TIME, transition : "easeOutQuad",
                    onComplete : () => {
                        parentActor.set_height( -1 )
                        this._errorBox.show()
                    }
                } )
            }
        } catch ( e ) { dev.log( e ) }
    }
} )