/*
 * Worksets extension for Gnome 3
 * This file is part of the worksets extension for Gnome 3
 * Copyright 2019 Anthony D - blipk.xyz
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
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;
const Lang = imports.lang;
const FileQueryInfoFlags = imports.gi.Gio.FileQueryInfoFlags;
const FileCopyFlags = imports.gi.Gio.FileCopyFlags;
const FileTest = GLib.FileTest;
const Gettext = imports.gettext;

//Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const utils = Me.imports.utils;
const debug = Me.imports.devUtils;
const scopeName = "fileUtils";

const CONF_DIR = GLib.get_user_config_dir() + '/' + Me.uuid;
const SESSION_FILE = 'session.json';

function checkExists(path) {
    let directoryFile = Gio.file_new_for_path(path);
    return directoryFile.query_exists(null);
}
// Disk I/O handlers
function enumarateDirectoryChildren(directory=CONF_DIR, returnFiles=true, returnDirectories=false, searchSubDirectories=false, searchLevel=1/*-1 for infinite*/){
    let childrenFileProperties = {parentDirectory: directory, fullname: null, name: null, extension: null, type: null};
    let childrenFilePropertiesArray = [];
    try {
    let directoryFile = Gio.file_new_for_path(directory);
    if (!directoryFile.query_exists(null)) throw Error(directory+' not found');
    let children = directoryFile.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);

    let fileIterator;
    while ((fileIterator = children.next_file(null)) != null) {
        let type = fileIterator.get_file_type();
        let name = fileIterator.get_name();
        let tmpExtension = name.split('.');
        let extension = tmpExtension[tmpExtension.length-1];
        tmpExtension.pop();
        let nameWithoutExtension = tmpExtension.join('.');

        if (type == Gio.FileType.REGULAR) {
            if (returnFiles) {
                childrenFilePropertiesArray.push({parentDirectory: directory, fullname: name, name: nameWithoutExtension, extension: extension, type: type});
            }
        } else if (type == Gio.FileType.DIRECTORY) {
            if (searchSubDirectories) {
                let childDirectory = directoryFile.get_child(fileIterator.get_name());
                if (searchLevel > 0) {
                    childrenFilePropertiesArray.push(enumarateDirectoryChildren(childDirectory, returnDirectories, searchSubDirectories, searchLevel));
                    searchLevel--;
                } else if (searchLevel === -1) {
                    childrenFilePropertiesArray.push(enumarateDirectoryChildren(childDirectory, returnDirectories, searchSubDirectories, searchLevel));
                }
            }
            if (returnDirectories) {
                childrenFilePropertiesArray.push({parentDirectory: directory, fullname: name, name: nameWithoutExtension, extension: extension, type: type});
            }
        }
    }
    } catch(e) {debug.log(scopeName+'.'+arguments.callee.name, e)}

    return childrenFilePropertiesArray;
}
function saveRawToFile (rawobject, filename, directory=CONF_DIR, append=false, async=false) {
    //try {
    let savePath = directory + '/' + filename;
    let contentsString = rawobject.toString();
    let contents = new GLib.Bytes(rawobject);

    // Make sure dir exists
    GLib.mkdir_with_parents(directory, parseInt('0775', 8));
    let file = Gio.file_new_for_path(savePath);
    if (async) {
        if (append) {
            file.append_to_async(Gio.FileCreateFlags.NONE, GLib.PRIORITY_DEFAULT, null, function(obj, res) {aSyncSaveCallback(obj, res, contents);});
        } else {        
            file.replace_async(null, false, Gio.FileCreateFlags.NONE, GLib.PRIORITY_DEFAULT, null, function (obj, res) {aSyncSaveCallback(obj, res, contents);});
        }
    } else {
        if (append) {
            let outstream = file.append_to(Gio.FileCreateFlags.NONE, null);
            outstream.write(contentsString, null);
            outstream.close(null);
        } else {        
            let outstream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            outstream.write(contentsString, null);
            outstream.close(null);
        }
    }
    //Debug logger uses this to save to disk so can end up with nasty recursion if theres an error here
    //} catch(e) {debug.log(scopeName+'.'+arguments.callee.name, e)}
}
function saveJSObjectToFile (jsobject, filename, directory=CONF_DIR, append=false, async=false) {
    let savePath = directory + '/' + filename;
    let jsonString = JSON.stringify(jsobject, null, 1);
    let contents = new GLib.Bytes(jsonString);

    // Make sure dir exists
    GLib.mkdir_with_parents(directory, parseInt('0775', 8));
    let file = Gio.file_new_for_path(savePath);
    try{
    if (async) {
        if (append) {
            file.append_to_async(Gio.FileCreateFlags.NONE, GLib.PRIORITY_DEFAULT, null, function(obj, res) {aSyncSaveCallback(obj, res, contents);});
        } else {        
            file.replace_async(null, false, Gio.FileCreateFlags.NONE, GLib.PRIORITY_DEFAULT, null, function (obj, res) {aSyncSaveCallback(obj, res, contents);});
        }
    } else {
        if (append) {
            let outstream = file.append_to(Gio.FileCreateFlags.NONE, null);
            outstream.write(jsonString, null);
            outstream.close(null);
        } else {
            let outstream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            //Shell.write_string_to_stream (outstream, jsonString);
            outstream.write(jsonString, null);
            outstream.close(null);
        }
    }
    } catch(e) {debug.log(scopeName+'.'+arguments.callee.name, e)}
}
function aSyncSaveCallback(obj, res, contents) {
    let stream = obj.replace_finish(res);
    
    stream.write_bytes_async(contents, GLib.PRIORITY_DEFAULT, null, function (w_obj, w_res) {
        w_obj.write_bytes_finish(w_res); stream.close(null);
    });
}

function loadJSObjectFromFile(filename=SESSION_FILE, directory=CONF_DIR, callback=null, async=false) {
    let loadPath = directory + '/' + filename;
    let jsobject;

    let file = Gio.file_new_for_path(loadPath);

    if (!GLib.file_test(loadPath, FileTest.EXISTS)) { throw Error("File does not exist: "+loadPath); }
    if (async === true) {
        if (typeof callback !== 'function') {throw TypeError('loadJSObjectFromFile callback must be a function');}
        
        file.query_info_async('*', FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, function (src, res) {
            let file_info = src.query_info_finish(res);    
            file.load_contents_async(null, function (obj, res) {
                let [success, contents] = obj.load_contents_finish(res);
                if (success) {
                    jsobject = JSON.parse(contents);
                    if(jsobject === undefined) {throw SyntaxError('Error parseing file contents to JS Object. Syntax Error?');}
                    callback(jsobject);
                }
            });
        });           
    } else {
        let buffer = file.load_contents(null, null, null);
        let contents = buffer[1];
        jsobject = JSON.parse(contents);
        if(jsobject === undefined) {throw SyntaxError('Error parseing file contents to JS Object. Syntax Error.');}
    }

    return jsobject;
}
