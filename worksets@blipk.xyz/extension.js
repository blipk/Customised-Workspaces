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
 *
 * Credits:
 * This extension was created by using the following gnome-shell extensions
 * as a learning resource:
 * - dash-to-panel@jderose9.github.com.v16.shell-extension
 * - clipboard-indicator@tudmotu.com
 * - workspaces-to-dock@passingthru67.gmail.com
 * - workspace-isolated-dash@n-yuki.v14.shell-extension
 * - historymanager-prefix-search@sustmidown.centrum.cz
 * - minimum-workspaces@philbot9.github.com.v9.shell-extension
 * - gsconnect@andyholmes.github.io
 * Many thanks to those great extensions.
 */

// External imports
import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as config from "resource:///org/gnome/shell/misc/config.js"
import Meta from "gi://Meta"
const [major] = config.PACKAGE_VERSION.split( "." )
const shellVersion = Number.parseInt( major )

// Internal imports
import * as dev from "./dev.js"
import * as sessionManager from "./sessionManager.js"

const scopeName = "cw-shell-extension"


import { Extension, gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js"

export let WorksetsInstance = Extension.lookupByUUID( "worksets@blipk.xyz" )

export default class Worksets extends Extension {

 enable() {
    WorksetsInstance = this

    try {
        dev.log( scopeName, "@----------|" )
        if ( this.session ) return // Already initialized
        global.shellVersion = shellVersion

        // Maintain compatibility with GNOME-Shell 3.30+ as well as previous versions.
        this.gScreen = global.screen || global.display
        this.gWorkspaceManager = global.screen || global.workspace_manager
        this.gMonitorManager = global.screen || ( Meta.MonitorManager.get && Meta.MonitorManager.get() ) || global.backend.get_monitor_manager()

        // To tune behaviour based on other extensions
        this.gExtensions = new Object()
        this.gExtensions.dash2panel = Extension.lookupByUUID( "dash-to-panel@jderose9.github.com" )
        this.gExtensions.dash2dock = Extension.lookupByUUID( "dash-to-dock@micxgx.gmail.com" )

        this.settings = this.getSettings( "org.gnome.shell.extensions.worksets" )

        // Spawn session
        this.session = new sessionManager.SessionManager()

        dev.log( scopeName, "@~.........|" )
    } catch ( e ) {
        dev.log( scopeName, e )
        throw e // Allow gnome-shell to still catch extension exceptions
    }
}

 disable() {
    WorksetsInstance = this


    try {
        dev.log( scopeName, "!~~~~~~~~~~|" )

        this.session.saveSession()
        if ( this.worksetsIndicator ) this.worksetsIndicator.destroy()
        delete this.worksetsIndicator
        delete Main.panel.statusArea["WorksetsIndicator"]
        if ( this.workspaceIsolater ) this.workspaceIsolater.destroy()
        delete this.workspaceIsolater
        if ( this.workspaceManager ) this.workspaceManager.destroy()
        delete this.workspaceManager
        if ( this.workspaceViewManager ) this.workspaceViewManager.destroy()
        delete this.workspaceViewManager
        if ( this.session ) this.session.destroy()
        delete this.session
        if ( this.settings ) this.settings.run_dispose()
        delete this.settings

        dev.log( scopeName, "!^^^^^^^^^^|" + "\r\n" )
    } catch ( e ) {
        dev.log( scopeName, e )
        throw e // Allow gnome-shell to still catch extension exceptions
    }

}

}



