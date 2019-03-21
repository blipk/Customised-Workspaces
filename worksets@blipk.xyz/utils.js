/*
 * Worksets extension for Gnome 3
 * This file is part of the worksets extension for Gnome 3
 * Copyright (C) 2019 A.D. - http://blipk.xyz
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

//Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const dev = Me.imports.devUtils;
const Gettext = imports.gettext;
const _ = Gettext.domain('worksets').gettext;
const scopeName = "utils";

function textFormatter(text, options={/*length: 50*/}) {
    if (isEmpty(text)) return text;
    if (options.length) text = truncateString(text, options.length);
    return _(text);
}

//General
function truncateString(instring, length) {
    let shortened = instring.replace(/\s+/g, ' ');
    if (shortened.length > length)
        shortened = shortened.substring(0,length-1) + '...';
    return shortened;
}

var isEmpty = function(v){
    return typeof v === 'undefined' ? true 
                : v === null ? true
                : v === [] ? true
                : typeof v === 'object' ? (Object.getOwnPropertyNames(v).length > 0 ? false : true)
                : typeof v === 'string' ? (v.length > 0 ? false : true)
                : Boolean(v);
}

Object.defineProperty(Object.prototype, 'forEachEntry', {
    value: function (callback, thisArg, recursive=false, recursiveIndex=0) {
        if (this === null) throw new TypeError('Not an object'); 
        thisArg = thisArg || this;
        
        Object.keys(this).forEach(function(key, entryIndex){
            let retIndex = entryIndex + recursiveIndex;
            callback.call(thisArg, key, this[key], retIndex, this);
            if (typeof this[key] === 'object' && this[key] !== null && recursive===true) {
                if (Array.isArray(this[key]) === true) {
                    this[key].forEach(function(prop, index){
                        if (Array.isArray(this[key][index]) === false && typeof this[key][index] === 'object' && this[key][index] !== null ) {
                            recursiveIndex += Object.keys(this).length - 1;
                            this[key][index].forEachEntry(callback, thisArg, recursive, recursiveIndex);
                        }
                    }, this);
                } else {
                    recursiveIndex += Object.keys(this).length - 1;
                    this[key].forEachEntry(callback, thisArg, recursive, recursiveIndex); 
                }
            }
        }, this);
    }
});


var handler = {
    get: function(obj, prop) {
        return prop in obj ?
            obj[prop] :
            37;
    }
};

var DisplayWrapper = {
    get: function(obj, prop, value) {
        if (prop === 'screen') {
        return prop in obj ?
            obj[prop] :
            global.display;
        }
        if (prop === 'workspace_manager') {
            return prop in obj ?
                obj[prop] :
                global.screen || global.display;
        }
        if (prop === 'MonitorManager') {
            return prop in obj ?
                obj[prop] :
                global.screen || global.display;
        }
    },

    /*
    getScreen: function() {
        return global.screen || global.display;
    },

    getWorkspaceManager: function() {
        return global.screen || global.workspace_manager;
    },

    getMonitorManager: function() {
        return global.screen || Meta.MonitorManager.get();
    }
    */
};

Me.gsCompat = new Proxy(global, DisplayWrapper);