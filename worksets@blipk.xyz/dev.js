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
 */

// Internal imports
import { WorksetsInstance as Me } from "./extension.js"
import * as fileUtils from "./fileUtils.js"

export function log( ) {
    const _debug_ = Me.session?.activeSession?.Options?.DebugMode ?? true
    const args = [...arguments]
    const stack = ( new Error() ).stack.split( "\n" )
    const caller_stack = stack[2].toString().split( "/" )
    const context_stack = stack[1].toString().split( "/" )
    const caller = caller_stack[caller_stack.length - 1]
    const context = context_stack[context_stack.length - 1]



    if ( !_debug_ ) return

    const printObj = ( obj ) => {
        let label, output
        if ( obj instanceof Error || obj.stack ) {
            label = "\n!ERROR  |>\n"
            output += `|- ${obj.name} ${obj.message}\n|- Stack Trace:\n ${obj.stack}\n`
        } else if ( typeof obj === "object" ) {
            label = "\n@Object |>\n"
            let seen = []
            output = JSON.stringify( obj, function ( key, val ) {
                if ( val != null && typeof val == "object" ) {
                    if ( seen.indexOf( val ) > 0 ) return
                    seen.push( val )
                }
                return val
            }, 2 ) + "\n"
        } else {
            label = "\n:INFO   | "
            output = obj && obj.toString ? obj.toString() : obj
            output += ""
        }

        return [label, output]
    }

    const timestamp = new Date().toLocaleString()
    const prefix = `(${Me.uuid.toString()}) [${timestamp}]:-> ${caller} -> ${context}\n`
    let out = prefix
    let args_out = ""
    for ( const arg of args ) {
        const [label, output] = printObj( arg )
        const arg_out = `${label} ${output}`
        if ( arg instanceof Error ) {
            console.log( "Extension", "Worksets", arg_out )
            console.error( arg )
        } else {
            console.log( "Extension", "Worksets", arg_out )
        }
        args_out += arg_out
    }
    out += args_out.trimStart() + "\n"

    fileUtils.saveToFile( out, "debug.log", fileUtils.CONF_DIR(), true, true )
}


export function dump( object, objectName ) {
    const _debug_ = Me.session?.activeSession?.Options?.DebugMode ?? true
    if ( !_debug_ ) return

    const timestamp = Date.now()

    //if (typeof object !== 'object') return;

    let out = ""
    let seen = []
    out += JSON.stringify( object, function ( key, val ) {
        if ( val != null && typeof val == "object" ) {
            if ( seen.indexOf( val ) >= 0 ) return
            seen.push( val )
        }
        return val
    }, 2 ) + "\n\n"

    fileUtils.saveToFile( out, objectName + "-" + timestamp + ".json", fileUtils.CONF_DIR(), true, false )
}