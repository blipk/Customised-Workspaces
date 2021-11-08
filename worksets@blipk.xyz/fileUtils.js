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
const ByteArray = imports.byteArray;
const { GLib, Gio } = imports.gi;

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const { dev } = Me.imports;

// Directory and file paths for resources
var USER_CONF_DIR = GLib.get_user_config_dir();
var USER_CACHE_DIR = GLib.get_user_cache_dir();
var USER_DATA_DIR = GLib.get_user_data_dir();
var SYS_DATA_DIRS = GLib.get_system_data_dirs();
var INSTALL_DIR = GLib.build_pathv('/', [USER_DATA_DIR, 'gnome-shell', 'extensions', Me.uuid]);
var RES_DIR = GLib.build_pathv('/', [INSTALL_DIR, 'res'])
var CONF_DIR = GLib.build_pathv('/', [USER_CONF_DIR, Me.uuid]);
var APP_CHOOSER_EXEC = GLib.build_filenamev([INSTALL_DIR, 'appChooser.js']);

function checkExists(path) {
    let result = false;
    if (typeof path == 'string') {
        let directoryFile = Gio.file_new_for_path(path);
        result = directoryFile.query_exists(null);
    } else if (typeof path == 'object') {
        result = true;
        path.forEach((path) => {
            if (!checkExists(path)) result = false;
        }, this)
    }
    return result;
}
// Disk I/O handlers
function enumarateDirectoryChildren(directory=CONF_DIR, returnFiles=true, returnDirectories=false, searchSubDirectories=false, searchLevel=1/*-1 for infinite*/){
    let childrenFileProperties = {parentDirectory: directory, fullname: null, name: null, extension: null, type: null};
    let childrenFilePropertiesArray = [];

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
            if (returnFiles)
                childrenFilePropertiesArray.push({parentDirectory: directory, fullname: name, name: nameWithoutExtension, extension: extension, type: type});
        } else if (type == Gio.FileType.DIRECTORY) {
            if (returnDirectories)
                childrenFilePropertiesArray.push({parentDirectory: directory, fullname: name, name: nameWithoutExtension, extension: extension, type: type});
            if (!searchSubDirectories) continue;
            let childDirectory = directoryFile.get_child(fileIterator.get_name());
            if (searchLevel > 0 || searchLevel <= -1) {
                childrenFilePropertiesArray.push(enumarateDirectoryChildren(childDirectory, returnDirectories, searchSubDirectories, searchLevel));
                searchLevel--;
            }
        }
    }

    return childrenFilePropertiesArray;
}
function saveToFile(object, filename, directory=CONF_DIR, raw=false, append=false, async=false) {
    let savePath = GLib.build_filenamev([directory, filename]);
    let outBuff;
    if (raw) outBuff = object.toString();
    else outBuff = JSON.stringify(object, null, 1);

    let contents = new GLib.Bytes(outBuff);

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
            outstream.write(outBuff, null);
            outstream.close(null);
        } else {
            let outstream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            //Shell.write_string_to_stream (outstream, jsonString);
            outstream.write(outBuff, null);
            outstream.close(null);
        }
    }
}
function aSyncSaveCallback(obj, res, contents) {
    let stream = obj.replace_finish(res);
    stream.write_bytes_async(contents, GLib.PRIORITY_DEFAULT, null, function (w_obj, w_res) {
        w_obj.write_bytes_finish(w_res); stream.close(null);
    });
}
function loadJSObjectFromFile(filename=CONF_FILE, directory=CONF_DIR, callback=null, async=false) {
    let loadPath = GLib.build_filenamev([directory, filename]);
    let jsobject;

    let file = Gio.file_new_for_path(loadPath);

    if (!GLib.file_test(loadPath, GLib.FileTest.EXISTS)) { throw Error("File does not exist: "+loadPath); }
    if (async === true) {
        if (typeof callback !== 'function') {throw TypeError('loadJSObjectFromFile callback must be a function');}

        file.query_info_async('*', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, function (src, res) {
            let file_info = src.query_info_finish(res);
            file.load_contents_async(null, function (obj, res) {
                let [success, contents] = obj.load_contents_finish(res);
                if (success) {
                    jsobject = JSON.parse(ByteArray.toString(contents));
                    if(jsobject === undefined) {throw SyntaxError('Error parseing file contents to JS Object. Syntax Error?');}
                    callback(jsobject);
                }
            });
        });
    } else {
        //let buffer = file.load_contents(null, null, null);
        let buffer = file.load_contents(null);
        let contents = buffer[1];
        jsobject = JSON.parse(ByteArray.toString(contents));
        if(jsobject === undefined) {throw SyntaxError('Error parseing file contents to JS Object. Syntax Error.');}
    }

    return jsobject;
}