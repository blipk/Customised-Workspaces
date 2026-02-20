/*
 * Customised Workspaces extension for Gnome 3
 * This file is part of the Customised Workspaces Gnome Extension for Gnome 3
 * Copyright (C) http://github.com/blipk
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
import Gio from "gi://Gio"
import GLib from "gi://GLib"

// Internal imports
import * as dev from "./dev.js"
import * as fileUtils from "./fileUtils.js"

// Maximum lengths for string fields
const MAX_WORKSET_NAME_LENGTH = 100
const MAX_SESSION_NAME_LENGTH = 100
const MAX_DISPLAY_NAME_LENGTH = 200
const MAX_EXEC_LENGTH = 1024
const MAX_ICON_LENGTH = 512
const MAX_APP_ID_LENGTH = 512
const MAX_PATH_LENGTH = 4096
const MAX_FAVAPPS_COUNT = 100
const MAX_WORKSETS_COUNT = 50
const MAX_IMAGE_FILE_SIZE = 524288000 // 500MB for HDR wallpapers

// Regex patterns
// eslint-disable-next-line no-control-regex
const SHELL_METACHAR_PATTERN = /[;&|`$(){}!<>\\#\n\r\x00]/
const PATH_SEPARATOR_PATTERN = /[/\\]/
const PATH_TRAVERSAL_PATTERN = /\.\./

// Valid enum values
const VALID_BACKGROUND_STYLES = [
    "NONE", "WALLPAPER", "CENTERED", "SCALED", "ZOOM", "STRETCHED", "SPANNED"
]

// Valid workspace map keys
const VALID_WORKSPACE_KEYS = [
    "Workspace0",
    "Workspace1",
    "Workspace2",
    "Workspace3",
    "Workspace4",
    "Workspace5",
    "Workspace6",
    "Workspace7",
    "Workspace8",
    "Workspace9"
]

// Whitelisted property sets
const WORKSET_ALLOWED_KEYS = new Set( [
    "WorksetName",
    "WindowData",
    "BackgroundImage",
    "BackgroundImageDark",
    "BackgroundStyle",
    "BackgroundStyleDark",
    "FavApps"
] )
const FAVAPP_ALLOWED_KEYS = new Set( ["name", "displayName", "icon", "exec"] )
const BOOLEAN_OPTION_KEYS = [
    "ShowNotifications",
    "ShowHelpers",
    "IsolateWorkspaces",
    "ShowPanelIndicator",
    "ShowWorkspaceOverlay",
    "ShowOverlayThumbnailLabels",
    "HideAppList",
    "DisableWallpaperManagement",
    "ReverseMenu",
    "DebugMode",
    "GrayscaleIcon"
]


export class InputValidator {

    // --- Core Type/Value Helpers ---

    static safeString ( value, fieldName, maxLength = 1024, fallback = "" ) {
        if ( typeof value !== "string" ) {
            dev.log( true, `InputValidator: '${fieldName}' expected string, got ${typeof value}, using fallback` )
            return fallback
        }
        if ( value.length > maxLength ) {
            dev.log( true, `InputValidator: '${fieldName}' exceeds max length ${maxLength}, truncating` )
            return value.substring( 0, maxLength )
        }
        return value
    }

    static safeBoolean ( value, fieldName, fallback = false ) {
        if ( typeof value !== "boolean" ) {
            dev.log( true, `InputValidator: '${fieldName}' expected boolean, got ${typeof value}, using fallback` )
            return fallback
        }
        return value
    }

    static safeEnum ( value, fieldName, allowedValues, fallback ) {
        let str = InputValidator.safeString( value, fieldName, 100, fallback )
        if ( !allowedValues.includes( str ) && !allowedValues.includes( str.toUpperCase() ) ) {
            dev.log( true, `InputValidator: '${fieldName}' value '${str}' not in [${allowedValues.join( ", " )}], using fallback '${fallback}'` )
            return fallback
        }
        return allowedValues.includes( str ) ? str : str.toUpperCase()
    }

    static safeArray ( value, fieldName, maxLength = 100 ) {
        if ( !Array.isArray( value ) ) {
            dev.log( true, `InputValidator: '${fieldName}' expected array, got ${typeof value}, using empty array` )
            return []
        }
        if ( value.length > maxLength ) {
            dev.log( true, `InputValidator: '${fieldName}' array exceeds max count ${maxLength}, truncating` )
            return value.slice( 0, maxLength )
        }
        return value
    }

    static hasShellMetachars ( value ) {
        return SHELL_METACHAR_PATTERN.test( value )
    }

    static hasPathSeparators ( value ) {
        return PATH_SEPARATOR_PATTERN.test( value )
    }

    static hasPathTraversal ( value ) {
        return PATH_TRAVERSAL_PATTERN.test( value )
    }

    // --- Workset Name Validation (S3) ---

    static validateWorksetName ( name, fallback = "" ) {
        name = InputValidator.safeString( name, "WorksetName", MAX_WORKSET_NAME_LENGTH, fallback )

        if ( name.trim().length === 0 ) {
            dev.log( true, "InputValidator: WorksetName is empty or whitespace-only, using fallback" )
            return fallback
        }

        name = name.trim()

        if ( InputValidator.hasShellMetachars( name ) ) {
            dev.log( true, `InputValidator: WorksetName '${name}' contains shell metacharacters, stripping` )
            name = name.replace( SHELL_METACHAR_PATTERN, "" )
            if ( name.trim().length === 0 ) return fallback
        }

        if ( InputValidator.hasPathSeparators( name ) ) {
            dev.log( true, `InputValidator: WorksetName '${name}' contains path separators, stripping` )
            name = name.replace( PATH_SEPARATOR_PATTERN, "" )
            if ( name.trim().length === 0 ) return fallback
        }

        if ( name.includes( "\0" ) ) {
            dev.log( true, "InputValidator: WorksetName contains null bytes, stripping" )
            name = name.replace( /\0/g, "" )
            if ( name.trim().length === 0 ) return fallback
        }

        return name.trim()
    }

    // --- File Path Validation (S11, S15) ---

    static validateFilePath ( filePath, fieldName = "filePath", options = {} ) {
        const {
            allowEmpty = true,
            checkExists = false,
            checkIsFile = false,
            checkNotSymlink = true,
            maxFileSize = MAX_IMAGE_FILE_SIZE,
            checkFileSize = false
        } = options

        // Strip file:// URI prefix if present
        if ( typeof filePath === "string" )
            filePath = filePath.replace( "file://", "" )

        // Allow empty paths (many workset fields start empty)
        if ( allowEmpty && ( !filePath || filePath === "" ) )
            return ""

        filePath = InputValidator.safeString( filePath, fieldName, MAX_PATH_LENGTH, "" )
        if ( !filePath ) return ""

        // Must be absolute
        if ( !filePath.startsWith( "/" ) ) {
            dev.log( true, `InputValidator: '${fieldName}' must be an absolute path, got '${filePath}', clearing` )
            return ""
        }

        // Reject path traversal sequences
        if ( InputValidator.hasPathTraversal( filePath ) ) {
            dev.log( true, `InputValidator: '${fieldName}' contains '..' path traversal, clearing` )
            return ""
        }

        // Reject null bytes
        if ( filePath.includes( "\0" ) ) {
            dev.log( true, `InputValidator: '${fieldName}' contains null bytes, clearing` )
            return ""
        }

        // Filesystem checks (require file to actually exist)
        if ( checkExists || checkIsFile || checkNotSymlink || checkFileSize ) {
            try {
                let file = Gio.file_new_for_path( filePath )

                if ( !file.query_exists( null ) ) {
                    if ( checkExists ) {
                        dev.log( true, `InputValidator: '${fieldName}' file does not exist: ${filePath}, clearing` )
                        return ""
                    }
                    // File doesn't exist but checkExists not required - clear it anyway
                    // since nonexistent paths shouldn't be stored
                    dev.log( true, `InputValidator: '${fieldName}' file not found: ${filePath}, clearing` )
                    return ""
                }

                let fileInfo = file.query_info(
                    "standard::type,standard::size,standard::is-symlink",
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    null
                )

                // Reject symlinks
                if ( checkNotSymlink && fileInfo.get_is_symlink() ) {
                    dev.log( true, `InputValidator: '${fieldName}' is a symlink: ${filePath}, clearing` )
                    return ""
                }

                if ( checkIsFile && fileInfo.get_file_type() !== Gio.FileType.REGULAR ) {
                    dev.log( true, `InputValidator: '${fieldName}' is not a regular file: ${filePath}, clearing` )
                    return ""
                }

                if ( checkFileSize ) {
                    let size = fileInfo.get_size()
                    if ( size > maxFileSize ) {
                        dev.log( true, `InputValidator: '${fieldName}' exceeds max size ${maxFileSize} bytes (got ${size}), clearing` )
                        return ""
                    }
                }
            } catch ( e ) {
                dev.log( true, `InputValidator: '${fieldName}' filesystem check failed for '${filePath}': ${e.message}, clearing` )
                return ""
            }
        }

        return filePath
    }

    static validateImagePath ( filePath, fieldName = "imagePath" ) {
        return InputValidator.validateFilePath( filePath, fieldName, {
            allowEmpty      : true,
            checkNotSymlink : true,
            checkFileSize   : true,
            checkExists     : true,
            maxFileSize     : MAX_IMAGE_FILE_SIZE
        } )
    }

    static validateBackgroundPath ( filePath, fieldName = "BackgroundImage" ) {
        return InputValidator.validateImagePath( filePath, fieldName )
    }

    // --- Exec String Validation (S6, S14) ---

    static validateExecString ( exec, fieldName = "exec" ) {
        // Allow empty exec
        if ( !exec || exec === "" ) return ""

        exec = InputValidator.safeString( exec, fieldName, MAX_EXEC_LENGTH, "" )
        if ( !exec ) return ""

        // Strip desktop-entry field codes before metacharacter check
        // %u %U %f %F %d %D %n %N %i %c %k %v %m are desktop-entry spec codes
        let execForCheck = exec
            .replace( /%[uUfFdDnNickvm]/g, "" )
            .trim()

        // Reject shell metacharacters that could enable injection
        if ( InputValidator.hasShellMetachars( execForCheck ) ) {
            dev.log( true, `InputValidator: '${fieldName}' contains shell metacharacters, rejecting: ${exec}` )
            return ""
        }

        // Reject null bytes
        if ( exec.includes( "\0" ) ) {
            dev.log( true, `InputValidator: '${fieldName}' contains null bytes, rejecting` )
            return ""
        }

        // Validate it can be parsed as a proper argv array
        try {
            let [success, argv] = GLib.shell_parse_argv( exec.replace( /%[uUfFdDnNickvm]/g, " " ) )
            if ( !success || !argv || argv.length === 0 ) {
                dev.log( true, `InputValidator: '${fieldName}' failed argv parse, rejecting: ${exec}` )
                return ""
            }
        } catch ( e ) {
            dev.log( true, `InputValidator: '${fieldName}' is not a valid command line: ${e.message}, rejecting` )
            return ""
        }

        return exec
    }

    // --- FavApp Object Validation (S14, S3) ---

    static validateFavApp ( favApp, index = 0 ) {
        if ( typeof favApp !== "object" || favApp === null || Array.isArray( favApp ) ) {
            dev.log( true, `InputValidator: FavApp[${index}] is not a valid object, skipping` )
            return null
        }

        // Warn about unknown properties
        for ( let key of Object.keys( favApp ) ) {
            if ( !FAVAPP_ALLOWED_KEYS.has( key ) )
                dev.log( true, `InputValidator: Stripping unknown FavApp[${index}] property '${key}'` )
        }

        // Build sanitized copy with only whitelisted properties
        let sanitized = {}

        sanitized.name = InputValidator.safeString(
            favApp.name || "", `FavApp[${index}].name`, MAX_APP_ID_LENGTH, ""
        )

        sanitized.displayName = InputValidator.safeString(
            favApp.displayName || "", `FavApp[${index}].displayName`, MAX_DISPLAY_NAME_LENGTH, ""
        )

        sanitized.icon = InputValidator.safeString(
            favApp.icon || "", `FavApp[${index}].icon`, MAX_ICON_LENGTH, ""
        )

        sanitized.exec = InputValidator.validateExecString(
            favApp.exec || "", `FavApp[${index}].exec`
        )

        // Must have at minimum a name to be useful
        if ( !sanitized.name && !sanitized.displayName ) {
            dev.log( true, `InputValidator: FavApp[${index}] has no name or displayName, skipping` )
            return null
        }

        return sanitized
    }

    static validateFavAppsArray ( favApps, fieldName = "FavApps" ) {
        favApps = InputValidator.safeArray( favApps, fieldName, MAX_FAVAPPS_COUNT )

        let validated = []
        for ( let i = 0; i < favApps.length; i++ ) {
            // Skip empty string entries (the prototype has [""])
            if ( typeof favApps[i] === "string" && favApps[i] === "" ) continue
            // Skip non-object entries
            if ( typeof favApps[i] !== "object" || favApps[i] === null ) continue

            let result = InputValidator.validateFavApp( favApps[i], i )
            if ( result !== null ) validated.push( result )
        }
        return validated
    }

    // --- Workset Object Validation (S3) ---

    static validateWorkset ( workset, index = 0, getBackgroundFn = null, getBackgroundDarkFn = null ) {
        if ( typeof workset !== "object" || workset === null || Array.isArray( workset ) ) {
            dev.log( true, `InputValidator: Workset[${index}] is not a valid object, returning null` )
            return null
        }

        // Warn about unknown properties
        for ( let key of Object.keys( workset ) ) {
            if ( !WORKSET_ALLOWED_KEYS.has( key ) )
                dev.log( true, `InputValidator: Stripping unknown Workset[${index}] property '${key}'` )
        }

        let sanitized = {}

        // WorksetName
        sanitized.WorksetName = InputValidator.validateWorksetName(
            workset.WorksetName ?? "", "Workset " + index
        )
        if ( !sanitized.WorksetName ) sanitized.WorksetName = "Workset " + index

        // WindowData -- legacy, always null
        sanitized.WindowData = null

        // Background paths -- validate, clear to empty if file doesn't exist
        sanitized.BackgroundImage = InputValidator.validateBackgroundPath(
            workset.BackgroundImage || "", "BackgroundImage"
        )
        sanitized.BackgroundImageDark = InputValidator.validateBackgroundPath(
            workset.BackgroundImageDark || "", "BackgroundImageDark"
        )

        // Background styles
        sanitized.BackgroundStyle = InputValidator.safeEnum(
            workset.BackgroundStyle || "", "BackgroundStyle",
            VALID_BACKGROUND_STYLES, "ZOOM"
        )
        sanitized.BackgroundStyleDark = InputValidator.safeEnum(
            workset.BackgroundStyleDark || "", "BackgroundStyleDark",
            VALID_BACKGROUND_STYLES, sanitized.BackgroundStyle
        )

        // FavApps
        sanitized.FavApps = Array.isArray( workset.FavApps )
            ? InputValidator.validateFavAppsArray( workset.FavApps )
            : []

        return sanitized
    }

    // --- Session Object Validation (S3) ---

    static validateSession ( session ) {
        if ( typeof session !== "object" || session === null || Array.isArray( session ) ) {
            dev.log( true, "InputValidator: Session is not a valid object, returning null" )
            return null
        }

        let sanitized = {}

        // SessionName
        sanitized.SessionName = InputValidator.safeString(
            session.SessionName || "Default", "SessionName", MAX_SESSION_NAME_LENGTH, "Default"
        )
        if ( InputValidator.hasShellMetachars( sanitized.SessionName ) ) {
            dev.log( true, "InputValidator: SessionName contains shell metacharacters, stripping" )
            sanitized.SessionName = sanitized.SessionName.replace( SHELL_METACHAR_PATTERN, "" ) || "Default"
        }

        // Default
        sanitized.Default = InputValidator.safeString(
            session.Default || "", "Default", MAX_WORKSET_NAME_LENGTH, ""
        )

        // Options
        sanitized.Options = InputValidator.validateOptions( session.Options || {} )

        // Worksets
        sanitized.Worksets = []
        if ( Array.isArray( session.Worksets ) ) {
            let worksets = InputValidator.safeArray( session.Worksets, "Worksets", MAX_WORKSETS_COUNT )
            for ( let i = 0; i < worksets.length; i++ ) {
                let result = InputValidator.validateWorkset( worksets[i], i )
                if ( result !== null ) sanitized.Worksets.push( result )
            }
        }

        if ( sanitized.Worksets.length === 0 ) {
            dev.log( true, "InputValidator: Session has no valid Worksets, adding fallback" )
            sanitized.Worksets.push( {
                WorksetName         : "Primary",
                WindowData          : null,
                BackgroundImage     : "",
                BackgroundImageDark : "",
                BackgroundStyle     : "ZOOM",
                BackgroundStyleDark : "ZOOM",
                FavApps             : []
            } )
        }

        // Ensure Default points to a valid workset
        let worksetNames = sanitized.Worksets.map( w => w.WorksetName )
        if ( !worksetNames.includes( sanitized.Default ) )
            sanitized.Default = sanitized.Worksets[0].WorksetName

        // workspaceMaps
        sanitized.workspaceMaps = InputValidator.validateWorkspaceMaps( session.workspaceMaps || {} )

        return sanitized
    }

    static validateOptions ( options ) {
        if ( typeof options !== "object" || options === null )
            return {}

        let sanitized = {}

        for ( let key of BOOLEAN_OPTION_KEYS ) {
            if ( key in options )
                sanitized[key] = InputValidator.safeBoolean( options[key], `Options.${key}`, false )
        }

        // CliSwitch -- string option
        if ( "CliSwitch" in options ) {
            sanitized.CliSwitch = InputValidator.safeString(
                options.CliSwitch, "Options.CliSwitch", MAX_EXEC_LENGTH, ""
            )
        }

        return sanitized
    }

    static validateWorkspaceMaps ( maps ) {
        if ( typeof maps !== "object" || maps === null )
            return {}

        let sanitized = {}
        for ( let key of VALID_WORKSPACE_KEYS ) {
            if ( maps[key] && typeof maps[key] === "object" ) {
                sanitized[key] = {
                    defaultWorkset: InputValidator.safeString(
                        maps[key].defaultWorkset, `${key}.defaultWorkset`, MAX_WORKSET_NAME_LENGTH, ""
                    ),
                    currentWorkset: InputValidator.safeString(
                        maps[key].currentWorkset, `${key}.currentWorkset`, MAX_WORKSET_NAME_LENGTH, ""
                    )
                }
            } else {
                sanitized[key] = { defaultWorkset: "", currentWorkset: "" }
            }
        }
        return sanitized
    }

    // --- App Chooser Integrity (S8) ---

    static computeFileSHA256 ( filePath ) {
        try {
            let file = Gio.file_new_for_path( filePath )
            if ( !file.query_exists( null ) ) {
                dev.log( true, `InputValidator: File does not exist for hash: ${filePath}` )
                return null
            }

            let [success, contents] = file.load_contents( null )
            if ( !success ) {
                dev.log( true, `InputValidator: Could not read file for hash: ${filePath}` )
                return null
            }

            return GLib.compute_checksum_for_bytes(
                GLib.ChecksumType.SHA256,
                contents
            )
        } catch ( e ) {
            dev.log( true, `InputValidator: SHA256 computation failed for '${filePath}': ${e.message}` )
            return null
        }
    }

    static verifyAppChooserIntegrity ( expectedHash = null ) {
        let appChooserPath = fileUtils.APP_CHOOSER_EXEC()
        let actualHash = InputValidator.computeFileSHA256( appChooserPath )

        if ( !actualHash ) return false

        if ( expectedHash && actualHash !== expectedHash ) {
            dev.log( true,
                `InputValidator: appChooser.js integrity check failed. Expected: ${expectedHash}, Got: ${actualHash}` )
            return false
        }

        return actualHash
    }

    static ensureAppChooserExecutable () {
        try {
            let appChooserPath = fileUtils.APP_CHOOSER_EXEC()
            let file = Gio.file_new_for_path( appChooserPath )

            if ( !file.query_exists( null ) ) {
                dev.log( true, `InputValidator: appChooser.js not found at ${appChooserPath}` )
                return { needsChmod: false, error: "File not found" }
            }

            let info = file.query_info(
                "access::can-execute",
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                null
            )

            let isExecutable = info.get_attribute_boolean( "access::can-execute" )

            if ( isExecutable )
                return { needsChmod: false, error: null }

            // Not executable -- verify integrity before allowing chmod
            let hashResult = InputValidator.verifyAppChooserIntegrity()
            if ( hashResult === false ) {
                dev.log( true, "InputValidator: appChooser.js integrity check failed, not making executable" )
                return { needsChmod: false, error: "Integrity check failed" }
            }

            return { needsChmod: true, error: null }
        } catch ( e ) {
            dev.log( true, `InputValidator: ensureAppChooserExecutable failed: ${e.message}` )
            return { needsChmod: false, error: e.message }
        }
    }
}
