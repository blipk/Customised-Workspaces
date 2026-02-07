# Customised Workspaces - Deep Codebase Analysis & Audit Report

## Context

This report is a comprehensive analysis of the **Customised Workspaces** GNOME Shell extension (`worksets@blipk.xyz`, v99, GNOME 49+). It covers the architecture, component interactions, and all identified performance and security issues across the entire codebase (~204 KB of JavaScript across 14 files).

---

## Part 1: Architecture & Component Overview

### 1.1 Project Structure

```
worksets@blipk.xyz/
  extension.js            (134 lines)   Entry point, lifecycle
  sessionManager.js       (1018 lines)  Core state orchestrator
  workspaceManager.js     (338 lines)   Workspace switching logic
  workspaceView.js        (506 lines)   Overview UI / thumbnails
  panelIndicator.js       (714 lines)   Panel menu UI
  workspaceIsolater.js    (142 lines)   App isolation per workspace
  utils.js                (289 lines)   SignalHandler, InjectionHandler, helpers
  fileUtils.js            (193 lines)   File I/O & path management
  dev.js                  (135 lines)   Debug logging & timing
  prefs.js                (50 lines)    Preferences dialog (minimal)
  lib/ui/dialogs.js       (654 lines)   Modal dialog system
  lib/ui/uiUtils.js       (272 lines)   UI helpers, tooltips, notifications
  lib/ui/shader.js        (40 lines)    Text outline GLSL effect
  lib/ui/appChooser.js    (169 lines)   GTK app selection (standalone)
  stylesheet.css           (3.4 KB)     UI styling
  schemas/*.gschema.xml    (4.9 KB)     GSettings schema (14 keys)
```

### 1.2 Component Dependency Graph

```
extension.js (Entry Point / Singleton: WorksetsInstance)
 |
 +-- SessionManager (core orchestrator)
 |    |-- GSettings: org.gnome.shell.extensions.worksets
 |    |-- GSettings: org.gnome.desktop.interface (theme)
 |    |-- GSettings: org.gnome.desktop.background (wallpaper)
 |    |-- Shell.AppSystem (installed app scanning)
 |    |-- appFavorites (global.settings favorite-apps)
 |    |-- fileUtils.js (session.json persistence)
 |    |
 |    +-- WorkspaceManager
 |    |    |-- Meta.WorkspaceManager (workspace CRUD)
 |    |    |-- global.window_manager ("switch-workspace" signal)
 |    |    +-- WorkspaceIsolator (optional)
 |    |         |-- Shell.AppSystem.get_running (monkey-patched)
 |    |         |-- Shell.App.prototype.activate (monkey-patched)
 |    |         +-- AppIcon.prototype._updateRunningStyle (monkey-patched)
 |    |
 |    +-- WorkspaceViewManager
 |    |    |-- InjectionHandler (7 prototype injections into GNOME Shell)
 |    |    |-- Meta.Background / BackgroundManager (per-workspace wallpapers)
 |    |    |-- St widgets (overlay labels, action buttons)
 |    |    +-- PopupMenu (workset selection on empty workspaces)
 |    |
 |    +-- WorksetsIndicator (Panel Menu)
 |         |-- panelMenu.Button (GObject-registered)
 |         |-- PopupMenu subsystem (sections, switches, submenus)
 |         |-- lib/ui/dialogs.js (ObjectInterfaceDialog, ObjectEditorDialog)
 |         |-- lib/ui/uiUtils.js (icons, tooltips, notifications, images)
 |         +-- lib/ui/appChooser.js (spawned as subprocess)
 |
 +-- prefs.js (separate process, minimal -- redirects to panel menu)
```

### 1.3 Component Details

#### extension.js -- Entry Point
- **Class:** `Worksets extends Extension`
- **Exported global:** `WorksetsInstance` (imported as `Me` throughout)
- `enable()`: Initializes Meta references (`gScreen`, `gWorkspaceManager`, `gMonitorManager`), detects Dash-to-Panel/Dock, creates GSettings, instantiates `SessionManager`
- `disable()`: Saves session, destroys all managers in order, cleans up references
- Stores companion extension detection functions on `this.gExtensions`

#### sessionManager.js -- Core State Orchestrator
- **Class:** `SessionManager`
- **The largest and most central module** -- orchestrates all state
- **Data model:** `activeSession` object containing `Worksets[]`, `workspaceMaps{}`, `Options{}`
- **Persistence:** JSON to `~/.config/worksets@blipk.xyz/session.json` with MD5 hash-based change detection
- **Key responsibilities:**
  - Load/save/validate sessions
  - Manage worksets (create, edit, delete, display)
  - Set per-workspace favorites via `global.settings.set_strv("favorite-apps", ...)`
  - Set per-workspace wallpapers via `org.gnome.desktop.background` GSettings + `Meta.Background`
  - React to dark/light theme changes
  - Watch GSettings option changes and propagate to UI
  - Create and coordinate all sub-managers (WorkspaceManager, WorkspaceViewManager, WorksetsIndicator)

#### workspaceManager.js -- Workspace Lifecycle
- **Class:** `WorkspaceManager`
- Connects to `global.window_manager` `"switch-workspace"` signal
- `_workspaceUpdate()`: Ensures minimum workspaces exist based on active workset mappings, sets `_keepAliveId` for persistence
- `_activeWorkspaceChanged()`: On workspace switch, finds mapped workset and calls `displayWorkset()`, then refreshes overview
- `loadDefaultWorksets()`: Loads default/current workset for active workspace
- `activateIsolater()`: Creates/destroys `WorkspaceIsolator`, coordinates with Dash-to-Panel/Dock isolation settings
- `spawnOnSwitch()`: Executes user-configured CLI command via `bash -c`
- `getWorkspaceAppIds()`: Extracts app IDs from windows (includes snap app BAMF detection via `ps`)

#### workspaceView.js -- Overview UI Customization
- **Class:** `WorkspaceViewManager`
- **7 method injections** into GNOME Shell internals via `InjectionHandler`:
  - `workspace.Workspace._init` -- tracks workspace views
  - `workspacesView.WorkspacesView._init` -- tracks overview workspaces
  - `workspaceAnimation.WorkspaceGroup._init` -- tracks desktop groups, triggers `refreshDesktop()`
  - `workspaceThumbnail.ThumbnailsBox.addThumbnails` -- triggers `refreshOverview()`
  - `workspaceThumbnail.WorkspaceThumbnail._addWindowClone` -- reimplements window cloning
  - `overviewControls.ControlsManager._init` -- captures controls reference
  - `overviewControls.ControlsManager.gestureBegin` -- refreshes on gesture
- `refreshDesktop()`: Updates `Meta.Background` objects on desktop workspace groups
- `refreshOverview()`: Updates thumbnail backgrounds and calls `updateOverlay()`
- `updateOverlay()`: Builds action buttons (edit, close, change bg, create new) on workspace thumbnails

#### panelIndicator.js -- Panel Menu UI
- **Class:** `WorksetsIndicator extends panelMenu.Button` (GObject-registered)
- Builds a multi-section dropdown menu:
  - Session controls (new, load, save)
  - Default/active worksets (top)
  - Active worksets on other workspaces
  - Inactive worksets (history)
  - Extension options submenu (dynamic boolean toggles from GSettings)
- Each workset entry has: star (default), edit, open/close, and switch buttons
- Expandable submenu per workset: wallpaper preview, 7 background style buttons, favorite apps list with add/remove
- `_refreshMenu()`: Destroys and rebuilds all workset entries on every menu open

#### workspaceIsolater.js -- App Isolation
- **Class:** `WorkspaceIsolator`
- **Raw monkey-patching** (not using `InjectionManager`):
  - `Shell.AppSystem.get_running()` -- filters to active workspace apps
  - `Shell.App.prototype.activate()` -- redirects activation to active workspace
  - `AppIcon.prototype._updateRunningStyle()` -- hides running dots for off-workspace apps
- Signals: `"switch-workspace"` and `"restacked"` trigger `refresh()` which notifies all running app states and redraws dash

#### utils.js -- Foundation Classes
- **`SignalHandler`**: Manages GObject signal connections with auto-cleanup. Stores signal IDs in a sparse array.
- **`InjectionHandler`**: Wraps GNOME Shell's `InjectionManager` for safe prototype method overrides.
- **`Object.prototype.forEachEntry`**: Global prototype pollution -- adds recursive object iteration to ALL objects in GNOME Shell.
- **`Object.prototype.filterObj`**: Same pollution pattern for object filtering.
- **`spawnWithCallback()`**: Spawns async processes with stdout callback via `GLib.spawn_async_with_pipes`.

#### fileUtils.js -- File I/O
- **`CONF_DIR()`**: `~/.config/worksets@blipk.xyz/`
- **`saveToFile()`**: Writes JSON or raw text to files (defaults to synchronous)
- **`loadJSObjectFromFile()`**: Reads and parses JSON files (synchronous)
- **`checkExists()`**: File/directory existence check via Gio
- **`enumarateDirectoryChildren()`**: Recursive directory listing

#### dev.js -- Debug Logging
- **`log()`**: Captures stack trace, formats arguments, writes to `debug.log` synchronously
- **`timer()`**: Elapsed time measurement between paired calls
- **`dump()`**: Serializes objects to JSON files for inspection
- Debug mode defaults to `true` in GSettings schema

#### lib/ui/dialogs.js -- Modal Dialogs
- **`ObjectInterfaceDialog`**: Text input dialog with file browser for loading JSON objects
- **`ObjectEditorDialog`**: Property editor for complex objects with nested sub-editors
- Both extend `modalDialog.ModalDialog` and are GObject-registered

#### lib/ui/uiUtils.js -- UI Helpers
- `createIconButton()`: Creates St.Button with icon and optional tooltip
- `showUserNotification()`: Overlay label on `Main.uiGroup`
- `createTooltip()`: Hover-triggered notification with delay timers
- `setImage()`: Loads images via GdkPixbuf with module-level cache (`knownImages`)

### 1.4 Key Data Flows

**Workspace Switch:**
```
global.window_manager "switch-workspace"
  -> WorkspaceManager._activeWorkspaceChanged()
    -> _workspaceUpdate() [ensure workspaces exist]
    -> Find workset in workspaceMaps["WorkspaceN"]
    -> SessionManager.displayWorkset(workset)
      -> setFavorites(workset.FavApps) -> global.settings.set_strv()
      -> setBackground(bgPath, style) -> bSettings.set_string() + Meta.Background
      -> saveSession() -> fileUtils.saveToFile() -> session.json
    -> WorkspaceViewManager.refreshOverview()
    -> WorkspaceIsolator.refresh() [if enabled]
```

**Menu Open:**
```
Panel icon click -> "open-state-changed"
  -> WorksetsIndicator._refreshMenu()
    -> _worksetMenuItemsRemoveAll() [destroy all items]
    -> forEach Workset: _addWorksetMenuItemEntry() [rebuild all]
    -> saveSession() [sync disk I/O]
```

**Theme Change (Dark/Light):**
```
iSettings "changed::color-scheme"
  -> SessionManager handler
    -> Find active workset -> setBackground(dark/light variant)
    -> saveSession()
```

---

## Part 2: Security Audit

### CRITICAL

| ID | File(s) | Lines | Finding |
|----|---------|-------|---------|
| **S1** | [workspaceManager.js](worksets@blipk.xyz/workspaceManager.js#L321-L338) | 321-338 | **Command injection via `CliSwitch` + `WorksetName`**. User-configured CLI command is passed to `bash -c` after `replaceAll("$CWORKSPACE", worksetName)` with zero shell escaping. A workset name like `` `; rm -rf /` `` or `$(cmd)` is interpreted by bash. Attack vectors: (a) Modified `session.json` (group-writable dir per S4), (b) Loaded backup file with malicious workset name, (c) Any same-user process writing to `org.gnome.shell.extensions.worksets` dconf key. |
| **S2** | [workspaceManager.js](worksets@blipk.xyz/workspaceManager.js#L241-L244) | 241-244 | **Process environment disclosure via `ps e`**. `GLib.spawn_command_line_sync("ps e " + pid)` reads the full environment of other processes, potentially exposing API keys, tokens, passwords in environment variables. Also uses string concatenation for command construction (inherently unsafe pattern). |

### HIGH

| ID | File(s) | Lines | Finding |
|----|---------|-------|---------|
| **S3** | [sessionManager.js](worksets@blipk.xyz/sessionManager.js#L984-L1004) | 984-1004 | **Unsafe deserialization of backup files**. `loadObject()` loads JSON from `envbackups/` and pushes directly into `Worksets[]` with no schema validation. Combined with S1, a malicious backup file with a shell-metacharacter workset name leads to command injection. |
| **S4** | [fileUtils.js](worksets@blipk.xyz/fileUtils.js#L120) | 120 | **Group-writable config directory (0775)**. `GLib.mkdir_with_parents(dir, 0o775)` allows any same-group user to modify `session.json`. Since session data flows into shell execution (S1) and app launching (S6), this expands the attack surface. Should be `0700`. |
| **S5** | [fileUtils.js](worksets@blipk.xyz/fileUtils.js#L109-L150) | 109-150 | **Path traversal in `saveToFile()`**. The `filename` parameter is never validated. In `sessionManager.js:1011`, filename is `"env-" + workset.WorksetName + ".json"` -- a workset name containing `../` writes files outside the config directory. |
| **S6** | [panelIndicator.js](worksets@blipk.xyz/panelIndicator.js#L607-L613) | 607-613 | **Unsanitized `exec` from JSON passed to `GLib.shell_parse_argv` + `util.spawn`**. The `exec` field of favorite apps comes from `session.json`. Only `%u`/`%U` are replaced. A tampered session file can inject arbitrary commands. |

### MEDIUM

| ID | File(s) | Lines | Finding |
|----|---------|-------|---------|
| **S7** | [utils.js](worksets@blipk.xyz/utils.js#L102-L137) | 102-137 | **Object.prototype pollution**. Adds `forEachEntry` and `filterObj` to `Object.prototype`, affecting every object in the entire GNOME Shell process. Can cause conflicts with other extensions and unexpected behavior with `for...in` loops. |
| **S8** | [sessionManager.js](worksets@blipk.xyz/sessionManager.js#L84) | 84 | **`chmod +x` on every enable without integrity check**. `util.spawn(["chmod", "+x", APP_CHOOSER_EXEC()])` runs on every extension enable. If the file is replaced (writable parent), a malicious script gets +x. |
| **S9** | [workspaceIsolater.js](worksets@blipk.xyz/workspaceIsolater.js#L47-L89) | 47-89 | **No double-construction guard**. If constructor runs twice without `destroy()`, the backup reference (`_workspace_isolated_dash_nyuki_get_running`) points to the already-patched version. On destroy, the "restored" method is still patched -- unrecoverable corruption. |
| **S10** | [workspaceIsolater.js](worksets@blipk.xyz/workspaceIsolater.js#L59-L73) | 59-73 | **Raw prototype mutation of `Shell.App.prototype.activate`**. Uses direct monkey-patching instead of `InjectionManager`, polluting the prototype namespace and risking permanent corruption if `destroy()` errors. |
| **S11** | [sessionManager.js](worksets@blipk.xyz/sessionManager.js#L539-L575) | 539-575 | **Arbitrary file paths in background setting**. `bgPath` from session file is used in `Gio.file_new_for_path()` and `bSettings.set_string("picture-uri", ...)` with no validation. |
| **S12** | [utils.js](worksets@blipk.xyz/utils.js#L183-L184) | 183-184 | **stderr silently discarded** from spawned processes. Error output from `bash -c` commands and external tools is immediately closed, hiding security-relevant diagnostics. |
| **S13** | [dev.js](worksets@blipk.xyz/dev.js#L36) + [gschema](worksets@blipk.xyz/schemas/org.gnome.shell.extensions.worksets.gschema.xml#L48-L52) | 36, 48-52 | **Debug mode defaults to `true`**. All installations have verbose logging enabled, writing stack traces, object dumps, and session data to a group-readable file. |
| **S14** | [panelIndicator.js](worksets@blipk.xyz/panelIndicator.js#L569-L585) | 569-585 | **Untrusted subprocess output parsed and stored**. `JSON.parse(resource)` from appChooser output is pushed directly into `FavApps` with no schema validation. |
| **S15** | [uiUtils.js](worksets@blipk.xyz/lib/ui/uiUtils.js#L215-L222) | 215-222 | **No path validation for image loading**. File paths from session JSON passed directly to `GdkPixbuf.Pixbuf.new_from_file()` -- could reference extremely large images (OOM), network mounts (hang), or exploit image parser vulnerabilities. |

### LOW

| ID | File(s) | Lines | Finding |
|----|---------|-------|---------|
| S16 | fileUtils.js | 55-67, 168 | TOCTOU race in file existence checks before open |
| S17 | fileUtils.js | 80 | Symlink following in `enumarateDirectoryChildren` (`FileQueryInfoFlags.NONE`) |
| S18 | dev.js | 135 | `dump()` uses unsanitized `objectName` in filename (path traversal) |
| S19 | prefs.js | 39 | Unconditionally overwrites `show-panel-indicator` to `true` on prefs open |
| S20 | dialogs.js | 247-251 | `close()` always invokes callback even on cancel (Escape key) |
| S21 | appChooser.js | 36-40 | Fragile stack-trace-based path discovery for install directory |

---

## Part 3: Performance Audit

### CRITICAL

| ID | File(s) | Lines | Finding |
|----|---------|-------|---------|
| **P1** | [workspaceView.js](worksets@blipk.xyz/workspaceView.js#L326-L349) | 326-349 | **BackgroundManager churn during overview gestures**. `refreshOverview()` destroys and recreates `BackgroundManager` instances (GPU textures) for every thumbnail. Called from `notify::value` on the overview state adjustment which fires on **every animation frame** during gestures. The `"changed"` signal on new BackgroundManagers can trigger recursive `refreshOverview()` calls. |

### HIGH

| ID | File(s) | Lines | Finding |
|----|---------|-------|---------|
| **P2** | [fileUtils.js](worksets@blipk.xyz/fileUtils.js#L138-L149) / [sessionManager.js](worksets@blipk.xyz/sessionManager.js#L465) | 138-149, 465 | **Synchronous file I/O on compositor thread**. `saveToFile()` defaults to sync. Called on every workspace switch, favorites change, background change, menu open, and option toggle. Blocks the entire GNOME Shell main loop. |
| **P3** | [dev.js](worksets@blipk.xyz/dev.js#L53-L62) | 53-62 | **Stack trace computed before debug check**. `new Error().stack.split("\n")` runs on every `dev.log()` call (70+ catch blocks) regardless of whether `_debug_` is true. Stack trace construction is one of the most expensive JS operations. |
| **P4** | [dev.js](worksets@blipk.xyz/dev.js#L109) | 109 | **Synchronous file append on every log call**. Every `dev.log()` (with debug mode defaulting to `true`) opens, writes, and closes the log file synchronously on the compositor thread. |
| **P5** | [workspaceManager.js](worksets@blipk.xyz/workspaceManager.js#L242) | 242 | **Synchronous process spawn per window**. `GLib.spawn_command_line_sync("ps e " + pid)` runs inside a loop over all workspace windows, blocking the main thread for each. |
| **P6** | [sessionManager.js](worksets@blipk.xyz/sessionManager.js#L444-L522) | 444-522 | **Triple JSON.stringify + MD5 per save**. Each `saveSession()`: (1) `JSON.stringify` for hash, (2) MD5 computation, (3) `JSON.stringify` for deep copy, (4) `JSON.stringify` inside `saveToFile`. |
| **P7** | [sessionManager.js](worksets@blipk.xyz/sessionManager.js#L605-L649) | 605-649 | **Full app rescan on every `getFavorites()` call**. `scanInstalledApps()` iterates every installed app (hundreds including Flatpak/Snap) to rebuild `allApps` map. Called from favorites change signal, `newWorkset`, `newSession`, `_validateSession`. |
| **P8** | [panelIndicator.js](worksets@blipk.xyz/panelIndicator.js#L671-L691) | 671-691 | **Full menu teardown + rebuild + sync disk I/O on every open**. `_refreshMenu()` destroys all menu items, recreates all from scratch, then calls `saveSession()` (sync disk write). |
| **P9** | [workspaceView.js](worksets@blipk.xyz/workspaceView.js#L249-L251) | 249-251, 294-296 | **Meta.Background GPU memory leak**. Old `Meta.Background` objects are `delete`d (JS property removal) but never `destroy()`d. GPU textures remain allocated until GC collects the GObject (which may never happen due to reference cycles). |
| **P10** | [uiUtils.js](worksets@blipk.xyz/lib/ui/uiUtils.js#L210-L254) | 210-254 | **Unbounded image cache**. Module-level `knownImages` object caches every wallpaper image (CPU pixbuf + GPU St.ImageContent) forever -- never invalidated, never evicted, never cleared on disable/enable. |
| **P11** | [workspaceView.js](worksets@blipk.xyz/workspaceView.js#L237-L271) | 237-271 | **Meta.Background created on every workspace gesture**. `refreshDesktop()` triggered from `WorkspaceGroup._init` injection recreates all background managers for ALL workspace groups on every switch animation. |

### MEDIUM

| ID | File(s) | Lines | Finding |
|----|---------|-------|---------|
| **P12** | [workspaceManager.js](worksets@blipk.xyz/workspaceManager.js#L177-L198) | 177-198 | **`_workspaceUpdate()` called from every property getter**. `activeWorkspace`, `activeWorkspaceIndex`, `NumGlobalWorkspaces`, `activeWorksetName` all call `_workspaceUpdate()` which iterates workspace maps and calls `_checkWorkspaces()`. Cascading redundant updates on every workspace switch. |
| **P13** | [workspaceManager.js](worksets@blipk.xyz/workspaceManager.js#L126-L146) | 126-146 | **No debouncing on workspace switch cascade**. Rapid switching (keyboard, gestures) triggers the full `_activeWorkspaceChanged()` -> `displayWorkset()` -> `setFavorites()` + `setBackground()` + `saveSession()` + `refreshOverview()` chain repeatedly. |
| **P14** | [sessionManager.js](worksets@blipk.xyz/sessionManager.js#L390-L395) | 390-395 | **O(n^2) duplicate detection** in `_validateSession()`. Inside a `forEach` over worksets, `JSON.stringify` is called on every other workset for comparison. Also a correctness bug: only the last iteration's filter result is kept. |
| **P15** | [extension.js](worksets@blipk.xyz/extension.js#L74-L89) | 74-89 | **New `Gio.Settings` created per call**. `dash2panelSettings()` and `dash2dockSettings()` are factory functions, not cached. Each call creates a new dconf-backed Settings object. Signal handlers connected to these ephemeral objects may be ineffective or leak. |
| **P16** | [sessionManager.js](worksets@blipk.xyz/sessionManager.js#L203-L229) | 203-229 | **`saveSession()` called inside `forEach` loop** on background/options GSettings change signals. The `return` inside `forEach` only skips the current iteration, not the loop. |
| **P17** | [workspaceView.js](worksets@blipk.xyz/workspaceView.js#L165-L188) | 165-188 | **String operations on every animation frame**. Overview state handler runs string split + parseFloat + parseInt on `notify::value` which fires at 60fps during gestures. Also mutates GNOME Shell's internal `adjustment.lastValue`. |
| **P18** | [workspaceView.js](worksets@blipk.xyz/workspaceView.js#L357-L363) | 357-363 | **Overlay box fully rebuilt every refresh**. `updateOverlay()` destroys all children and the box itself, then recreates all labels, buttons, and layouts from scratch on every overview state change. |
| **P19** | [workspaceView.js](worksets@blipk.xyz/workspaceView.js#L59) | 59, 433 | **Menus array grows without cleanup**. Popup menus pushed to `this.menus` are never removed or destroyed. `destroy()` method doesn't clean them up. Leaks Clutter actors added to `Main.uiGroup`. |
| **P20** | [workspaceIsolater.js](worksets@blipk.xyz/workspaceIsolater.js#L128-L143) | 128-143 | **Full dash redisplay + all-app state notify on every restack**. `refresh()` calls `app.notify("state")` for every running app and `dash._queueRedisplay()` on `"restacked"` which fires on every window create/destroy/move/z-change. |
| **P21** | [panelIndicator.js](worksets@blipk.xyz/panelIndicator.js#L317-L337) | 317-337 | **Double add+move for menu items**. Items are added at position then moved redundantly, causing doubled Clutter layout invalidation and reflow. |
| **P22** | [uiUtils.js](worksets@blipk.xyz/lib/ui/uiUtils.js#L168-L186) | 168-186 | **Unbounded tooltip timer accumulation**. Every hover creates 2 `GLib.timeout_add` entries stored in `Me.session.signals`. Old entries persist across menu rebuilds, growing without bound during long sessions. |
| **P23** | [uiUtils.js](worksets@blipk.xyz/lib/ui/uiUtils.js#L221-L228) | 221-228 | **Synchronous pixbuf decode on compositor thread**. `GdkPixbuf.Pixbuf.new_from_file()` blocks the main thread while decoding images. For 4K+ wallpapers, visible frame drops. |
| **P24** | [sessionManager.js](worksets@blipk.xyz/sessionManager.js#L467) | 467 | **Redundant `refreshOverview()` after save**. Called inside `saveSession()`, but many callers also call it afterward, resulting in double refreshes. |
| **P25** | [utils.js](worksets@blipk.xyz/utils.js#L269-L281) | 269-281 | **Sparse array for signal IDs**. GLib source IDs can be large integers, creating arrays with thousands of empty slots. Should use `Map`. |

### LOW

| ID | File(s) | Lines | Finding |
|----|---------|-------|---------|
| P26 | sessionManager.js | 655 | `substr(-1, 1)` parses only last char of workspace key -- breaks for index >= 10 (also a bug) |
| P27 | sessionManager.js | 462 | Redundant deep copy via `JSON.parse(JSON.stringify())` before `saveToFile` which serializes again |
| P28 | panelIndicator.js | 172-175 | Options submenu items destroyed and rebuilt on every click (unnecessary) |
| P29 | panelIndicator.js | 702-708 | `_worksetMenuItemMoveToTop` adds item then `_refreshMenu()` destroys and rebuilds all |
| P30 | dialogs.js | throughout | `Array(x).map()` anti-pattern used as closure scope (6 instances) |
| P31 | dialogs.js | 298-300 | Unused deep copy of `editableObject` (`_unreferencedObjectCopy` never read) |
| P32 | uiUtils.js | 89-95 | `destroyIconButtons` has `destroy()` call commented out -- relies on parent cleanup |
| P33 | uiUtils.js | 68 | `iconsButtonsPressIds` initialized to `iconButtons` (shared reference bug) |
| P34 | dev.js | 76-82 | O(n^2) cycle detection in `JSON.stringify` replacer using `indexOf` instead of `Set` |
| P35 | workspaceView.js | 303-311 | `add_child` called on label that may already be a child (causes Clutter warning) |
| P36 | shader.js | 14-28 | GLSL source string re-allocated on each `vfunc_get_static_shader_source()` call |

---

## Part 4: Top Priority Recommendations

### Immediate (Security Critical)
1. **Shell-escape the `CliSwitch` command** -- use `GLib.shell_quote()` on `$CWORKSPACE` value, or switch to `argv`-based execution without `bash -c`
2. **Sanitize workset names** -- strip or reject path separators and shell metacharacters
3. **Change directory permissions** from `0775` to `0700`
4. **Validate JSON schema** on loaded backup files and session prototypes before use
5. **Migrate WorkspaceIsolator** from raw monkey-patching to `InjectionManager`

### High Priority (Performance)
1. **Make file I/O async by default** -- use `Gio.File.replace_async`/`load_contents_async` with callbacks
2. **Move debug check before stack trace** in `dev.log()` -- early return when `!_debug_`
3. **Default `debug-mode` to `false`** in gschema.xml
4. **Cache `BackgroundManager` instances** -- don't destroy/recreate on every overview refresh; add dirty flags
5. **Debounce `_activeWorkspaceChanged`** -- coalesce rapid workspace switches with a short timeout
6. **Cache `scanInstalledApps`** -- scan once on enable, invalidate on `Shell.AppSystem` `"installed-changed"` signal
7. **Eliminate redundant `saveSession()` calls** -- batch saves, remove from `_refreshMenu()` and inner loops
8. **Remove `Object.prototype` pollution** -- convert `forEachEntry`/`filterObj` to standalone utility functions

### Medium Priority (Performance)
1. **Don't rebuild entire menu on open** -- update existing items in-place, only add/remove changed entries
2. **Throttle `notify::value` handler** -- use integer state checks only, avoid string operations at 60fps
3. **Properly `destroy()` Meta.Background objects** before replacing them
4. **Clear `knownImages` cache** on extension disable; add LRU eviction
5. **Use `Map` instead of sparse array** in `SignalHandler`
6. **Clean up `this.menus`** in `WorkspaceViewManager.destroy()`

---

## Part 5: Verification Plan

To verify fixes after implementation:
1. **Security:** Test workset names with shell metacharacters (`; $(cmd)`, backticks, `../`), verify they are sanitized or rejected
2. **Security:** Check file permissions with `stat ~/.config/worksets@blipk.xyz/` -- should show `drwx------`
3. **Performance:** Enable GNOME Shell `looking-glass` (`Alt+F2` -> `lg`) and monitor frame timing during workspace gestures
4. **Performance:** Use `journalctl /usr/bin/gnome-shell -f` to check for Clutter warnings about add_child and layout issues
5. **Performance:** Monitor memory via `ps -o rss -p $(pgrep gnome-shell)` during repeated overview open/close cycles to verify no GPU/memory leaks
6. **Functional:** Test workspace switching, workset creation/editing/deletion, wallpaper changes, app isolation toggle, dark/light theme switching
7. **Regression:** Load existing session.json to verify backwards compatibility
