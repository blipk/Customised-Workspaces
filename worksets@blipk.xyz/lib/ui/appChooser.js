#!/usr/bin/env -S gjs -m

/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces extension for Gnome 3
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

"use strict"

// External imports
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import Gtk from "gi://Gtk?version=3.0"

// Find the root datadir of the extension using import.meta.url
export function getDatadir() {
    const thisFile = Gio.File.new_for_uri( import.meta.url )
    // appChooser.js is at lib/ui/appChooser.js, so go up 3 levels to get the extension root, then up 1 more for the repo root
    return thisFile.get_parent().get_parent().get_parent().get_parent().get_path()
}

// Old method kept for verification - uses error stack trace for path discovery
export function getDatadirFromErrorStack() {
    const m = /@(.+):\d+/.exec( ( new Error() ).stack.split( "\n" )[1] )
    const p = m[1].split( ":" )[1]
    return Gio.File.new_for_path( p ).get_parent().get_parent().get_parent().get_parent().get_path()
}

window.worksets = {
    dir: GLib.build_filenamev( [
        getDatadir(),
        "worksets@blipk.xyz"
    ] )
}
const worksets = window.worksets
imports.searchPath.unshift( worksets.dir )

worksets.metadata = ( () => {
    let data = GLib.file_get_contents( worksets.dir + "/metadata.json" )[1]
    return JSON.parse( new TextDecoder().decode( data ) )
} )()
worksets.resource_path = worksets.metadata["resource-path"]
worksets.application_id = worksets.metadata["application-id"]
worksets.is_local = worksets.dir.startsWith( GLib.get_user_data_dir() )
window._ = imports.gettext.domain( worksets.metadata["gettext-domain"] ).gettext

export class worksetsAppChooser {
    constructor( ARGV ) {
        this.application = new Gtk.Application( {
            application_id : worksets.application_id,
            flags          : Gio.ApplicationFlags.FLAGS_NONE
        } )
        //GLib.set_prgname('worksets');
        //GLib.set_application_name('worksets');

        this.WorksetName = ""

        // Extension
        const GioSSS = Gio.SettingsSchemaSource
        let schemaDir = GLib.build_pathv( "/", [worksets.dir, "schemas"] )
        let schemaSource = GioSSS.new_from_directory( schemaDir, GioSSS.get_default(), false )
        let schemaObj = schemaSource.lookup( worksets.metadata["settings-schema"], true )
        this.settings = new Gio.Settings( { settings_schema: schemaObj } )

        this._initOptions()
        this.application.connect( "activate", this.vfunc_activate.bind( this ) )
        this.application.connect( "startup", this.vfunc_startup.bind( this ) )
        this.application.connect( "handle-local-options", this.vfunc_handle_local_options.bind( this ) )
    }

    vfunc_startup() {
        this._buildUI()
    }

    _buildUI() {
        this.dialog = new Gtk.AppChooserDialog( {
            title        : "Select an application",
            heading      : "Will be added to '" + this.WorksetName + "' favourites",
            content_type : "any",
            icon_name    : "xapp-prefs-toolbar-symbolic",
            type         : 0
        } )
        this.dialog.get_widget().default_text = ""
        //this.dialog.get_widget().show_default = true;
        //this.dialog.get_widget().show_fallback = true;
        //this.dialog.get_widget().show_other = true;
        this.dialog.get_widget().show_recommended = true
        this.dialog.get_widget().show_all = true
        this.dialog.connect( "destroy", () => Gtk.main_quit() )
    }

    vfunc_activate() {
        this.dialog.show()
        this.dialog.present()
        if ( this.dialog.run() == Gtk.ResponseType.OK ) {
            let app = this.dialog.get_app_info()
            if ( app != null ) {
                let id = app.get_id()
                let name = app.get_name() || app.get_display_name() || "Unkown App Name"
                let exec = app.get_commandline()
                let icon = ""
                if ( app.get_icon() ) icon = app.get_icon().to_string()

                let newFav = {
                    "name"        : id,
                    "displayName" : name,
                    "icon"        : icon,
                    "exec"        : exec
                }
                print( JSON.stringify( newFav ) )
            }
        }
        this.dialog.close()
    }

    _initOptions() {
        this.application.add_main_option(
            "version",
            "v".charCodeAt( 0 ),
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            _( "Show release version" ),
            null
        )

        this.application.add_main_option(
            "workset",
            "w".charCodeAt( 0 ),
            GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING,
            _( "Default selected app" ),
            null
        )
    }

    vfunc_handle_local_options( application, options ) {
        try {
            if ( options.contains( "version" ) ) {
                print( `${worksets.metadata.name} v${worksets.metadata.version}` )
                return 0
            }

            if ( options.contains( "workset" ) ) {
                this.WorksetName = options.lookup_value( "workset", null ).unpack()
            }

            this.application.register( null )
            this.application.activate()
            return 0
        } catch ( e ) {
            console.error( e )
            return 1
        }
    }
}

( new worksetsAppChooser() ).application.run( [imports.system.programInvocationName].concat( ARGV ) )