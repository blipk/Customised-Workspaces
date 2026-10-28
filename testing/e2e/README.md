# End-to-end tests

These tests run the extension in a real GNOME Shell. They check the overview, the desktop, the panel menu and the dialogs with real pointer and keyboard input.

- [Quick start](#quick-start)
- [Git commit hook](#git-commit-hook)
- [Requirements](#requirements)
- [Command options and exit codes](#command-options-and-exit-codes)
- [Output](#output)
- [Test suites](#test-suites)
- [How the tests work](#how-the-tests-work)
- [Directory structure](#directory-structure)
- [Write a test](#write-a-test)
- [Troubleshooting](#troubleshooting)
- [References](#references)

## Quick start

```sh
pnpm run test:e2e                                    # all suites
bash testing/e2e/run.sh --suites startup,panel-menu  # some suites
```

The tests use the extension from the working tree ([`worksets@blipk.xyz/`](../../worksets@blipk.xyz/)). You do not need to install or package the extension first.

A test run takes approximately 1 to 2 minutes. It does not show a window and it does not change your desktop session: the test session has its own D-Bus session bus, its own dconf database and its own XDG directories.

## Git commit hook

The [`pre-commit`](../../.githooks/pre-commit) hook runs all suites before each commit that changes `worksets@blipk.xyz/` or `testing/e2e/`. When a test run fails or does not complete (exit code 1 or 2), the hook stops the commit.

- **Turn on:** `pnpm install` runs the `prepare` script, which sets `git config core.hooksPath .githooks`.
- **What it tests:** a copy of the staged files in a temporary directory. Unstaged changes do not change the result.
- **Output:** `testing/e2e/out/`, as for a manual run.
- **Skip once:** `git commit --no-verify`.

## Requirements

- GNOME Shell 49 or later. The tests were written on GNOME Shell 51.1.
- `dbus-run-session` (dbus), `dconf`, `glib-compile-schemas` (GLib) and `timeout` (coreutils).
- A GPU render node or a software renderer (llvmpipe), for the headless compositor.
- `gjs` with GTK 4, for the test windows ([`fixtures/test-window.js`](fixtures/test-window.js)).
- `fusermount3` or `fusermount` (optional), to remove FUSE mounts that D-Bus services can leave in the temporary runtime directory.

## Command options and exit codes

| Option | Description |
| --- | --- |
| `-s`, `--suites NAMES` | Run only these suites (comma separated). The suites always run in the [order below](#test-suites). |
| `-o`, `--output DIR` | Directory for the results, logs and screenshots. Default: `testing/e2e/out`. |
| `-t`, `--timeout SECONDS` | Stop GNOME Shell after this time. Default: 300. |
| `--allow-warnings` | Do not fail when GNOME Shell logs JS errors, JS warnings, criticals or warnings. |
| `-h`, `--help` | Show the help. |

| Exit code | Meaning |
| --- | --- |
| 0 | All checks passed, the extension logged no errors, and GNOME Shell logged no warnings. |
| 1 | One or more checks failed, the extension debug log has `!ERROR` entries, or GNOME Shell logged JS errors, JS warnings, criticals or warnings (see [Log checks](#log-checks)). |
| 2 | The test run did not complete, for example GNOME Shell did not start or the time-out occurred. |

### Log checks

A test run also fails when a log shows a problem that no check found:

- **Extension debug log:** each `!ERROR` entry. The extension catches most exceptions and writes them to this log with `dev.log()`.
- **GNOME Shell log:** each line with `JS ERROR`, `JS WARNING`, `-CRITICAL **` or `-WARNING **`, for example `St-WARNING **: Couldn't parse family in font property` from the stylesheet. [`fixtures/ignored-log-patterns.txt`](fixtures/ignored-log-patterns.txt) lists the lines that come from the isolated test session and not from the extension (for example, the session has no PipeWire). Add a pattern there only for such lines.

## Output

All output goes to `testing/e2e/out/` (git ignores it). The runner prints a summary of the results and of the two logs.

| File | Content |
| --- | --- |
| `results.txt` | One line for each result: `SUITE`, `PASS`, `FAIL`, `SKIP`, `NOTE` and a last `DONE` line. |
| `screenshots/<suite>-<name>.png` | Screenshots of the full screen at important steps. |
| `debug.log` | The extension debug log. The tests enable the "Enable logging" option. |
| `shell.log` | The output of GNOME Shell. |
| `test-window-<title>.log` | The output of each test window process. |
| `work/` | The isolated home directories: `config/` (dconf database, `worksets@blipk.xyz/session.json`), `data/` (the extension copy) and `cache/`. |

Example of `results.txt`:

```text
SUITE wallpaper-management
PASS wallpaper-management > thumbnail wallpapers are removed
FAIL wallpaper-management > Work preview shows the GNOME wallpaper -- 2 recorded
DONE 75 passed, 1 failed, 0 skipped
```

## Test suites

The suites run in this order in one GNOME Shell session. Each suite starts from a known workspace and puts back the settings that it changes. `disable` must be the last suite.

| Suite | What it verifies | Related |
| --- | --- | --- |
| `startup` | The extension loads the session fixture, applies the wallpaper and the favourites of workspace 0, and debug logging is on. | |
| `notifications` | Notification labels fade out over the given time, a new notification replaces the old one, and faded labels are destroyed. | |
| `overview-wallpapers` | The overview thumbnails and workspace previews show the wallpaper of each environment, and the environment overlay shows. | #70 |
| `wallpaper-management` | "Disable wallpaper management" puts the GNOME wallpapers back, and wallpaper changes from GNOME Settings are not recorded. | #70, PR #72 |
| `workspace-switch` | The switch animation shows the environment wallpapers, then the wallpaper and favourites of the new environment apply. | |
| `favourites` | A favourites change does not rebuild the hidden app grid at once, and the same favourites are not written again. | PR #71 |
| `all-environments` | An application goes to the given position in all environments, the position is kept as the default for the next time, and the position validator. | #69 |
| `panel-menu` | Real clicks and key presses: the panel menu, the option switches, the "Add app to all environments" flow (one click, then the position dialog, Enter or Cancel), the environment details and the overlay editor dialog. The suite gives the chosen application, because the application chooser is a separate GTK process. | #69, GNOME 51 menus |
| `workspace-creation` | The extension creates the workspaces up to the last workspace with an active environment: when the environment is added, and at log in (the suite disables the extension, edits the session file, and enables the extension). GNOME workspace checks and switches keep these workspaces, and the environment loads on its workspace. A workspace without a map in the session gets a map and shows the default environment. An environment is current on one workspace only. When the environment closes, GNOME removes its empty workspaces. Disable keeps the active workspace, removes all keep-alive flags, and puts the environment of a removed workspace after the remaining workspaces. | PR #77 |
| `workspace-keep-alive` | The extension and the GNOME keep-alive timers (`Main.wm.keepWorkspaceAlive()`, used when an application is dropped between the overview thumbnails) do not interfere: the extension writes no booleans to `_keepAliveId`, GNOME removes only its own GLib timers, and the extension keeps its workspaces after the timers stop. | |
| `workspace-order` | With a test window: the current environments follow their workspaces, and the default environments stay at their positions. GNOME inserts a workspace for the key binding "Move window one workspace to the left" on the first workspace (real keys), and for a window drop between two overview thumbnails (real pointer drag). Mutter reorders workspaces and removes a workspace in the middle (`reorder_workspace()`, `remove_workspace()`). A new first workspace does not take its default environment from the next workspace. | |
| `screen-lock` | With a test window on the Play workspace and no window on the Work workspace before it: the real lock screen (`Main.screenShield.lock()`) disables the extension, GNOME removes the empty Work workspace, and the Play environment stays with its window while the Work environment goes after it. After unlock (`Main.screenShield.deactivate()`), the extension creates the workspaces again, and each environment shows on its workspace. | |
| `fixed-workspaces` | With a fixed number of workspaces, the extension also adds the workspaces up to the environment, and GNOME saves the new number in its settings. When the user makes the number smaller (Mutter emits no "workspace-removed" then), the environment of the removed workspace closes and the extension does not add the workspace again. Then dynamic workspaces are on again. | |
| `disable` | Disabling the extension (as an uninstall does) puts the GNOME wallpapers back and removes all overlays. Later GNOME wallpaper changes show everywhere. The extension can be enabled again. | #70 |

## How the tests work

```text
run.sh
 ├─ copies worksets@blipk.xyz/ to out/work/data/gnome-shell/extensions/ and compiles its schemas
 ├─ writes out/work/config/worksets@blipk.xyz/session.json from fixtures/session.template.json
 └─ dbus-run-session (private session bus)
     ├─ dconf load / < fixtures/dconf-settings.template (enabled extension, wallpapers, debug logging)
     └─ gnome-shell --headless --virtual-monitor 1920x1080 --automation-script run-tests.js
         └─ run-tests.js: run() → suites/*.js → lib/reporter.js writes out/results.txt
```

- **GNOME Shell automation scripts.** GNOME Shell imports the file of `--automation-script` and calls its `run()` function after start-up (see [`js/ui/scripting.js`](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/scripting.js)). GNOME uses the same mechanism for its own performance tests and for `gnome-shell-test-tool`. When `run()` throws, GNOME Shell exits with an error code. The scripts run in the GNOME Shell process, thus they can use all GNOME Shell modules and the objects of the extension.
- **Isolation.** The runner sets `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `XDG_RUNTIME_DIR` to test directories. The private D-Bus session starts a private dconf service, thus all setting changes stay in `out/work/config/dconf/user`. The runtime directory is in `/tmp/wse2e.*`, because the path of the Wayland socket must be shorter than 108 bytes.
- **dconf and not the keyfile backend.** `gnome-shell-test-tool` uses `GSETTINGS_BACKEND=keyfile`. That backend emits `changed` also for writes that do not change a value, which the extension does not expect (the `isolate-workspaces` handler then calls itself until the stack is full). The tests use dconf, as a desktop session does.
- **Real input.** `lib/shell.js` makes a virtual pointer and a virtual keyboard with `Clutter.Seat.create_virtual_device()`. The events go through the normal Clutter event handling, gestures, drag and drop, and key bindings. The settings turn off the hot corners, because the virtual pointer starts in the top left corner.
- **Real windows.** `lib/windows.js` starts [`fixtures/test-window.js`](fixtures/test-window.js) (a GTK 4 window in a separate `gjs` process) as a Wayland client of the test session, so that suites can put windows on workspaces. GNOME keeps a workspace with a window, thus windows are necessary to test which workspaces GNOME removes.
- **No external test library.** No library for end-to-end tests of GNOME Shell extensions exists. [jasmine-gjs](https://github.com/ptomato/jasmine-gjs) runs unit tests in a separate `gjs` process and cannot run in the GNOME Shell process. The suites use a small reporter (`lib/reporter.js`) instead.

## Directory structure

| Path | Description |
| --- | --- |
| [`run.sh`](run.sh) | Runner: prepares the isolated session, starts GNOME Shell, prints the summary and sets the exit code. |
| [`run-tests.js`](run-tests.js) | Automation script: selects the suites, waits for the extension and runs the suites. |
| [`lib/reporter.js`](lib/reporter.js) | `Reporter`: `check()`, `skip()`, `note()`, `screenshot()` and the results file. |
| [`lib/shell.js`](lib/shell.js) | GNOME Shell helpers: `waitFor()`, `showOverview()`, `activateWorkspace()`, `workspaceCount()`, `workspaceAt()`, `allWorkspaces()`, `prepareInput()`, `click()`, `pressKeys()`, `pressKeyCombination()`, `actorCenter()`, `drag()`, `visibleModalDialogs()`, `recordSignals()`. |
| [`lib/worksets.js`](lib/worksets.js) | Access to the extension under test (session, options, views, workspace manager, wallpapers), the fixture constants, `addEnvironment()` / `removeEnvironment()` for the run-time environment `PLAY`, `resetCurrentWorksets()`, `workspaceMapsText()`, and `readSessionFile()` / `editSessionFile()`. |
| [`lib/windows.js`](lib/windows.js) | Test windows: `openTestWindow()` (gives the window and a `close()` function) and `findWindow()`. |
| [`suites/`](suites/) | One file for each suite. |
| [`fixtures/`](fixtures/) | Session and settings templates, the ignored log patterns, solid colour wallpapers (red, green, blue, yellow), and the test window client. |

## Write a test

Add a check to a suite, or add a suite file and put it in the `SUITES` list in [`run-tests.js`](run-tests.js):

```js
// Internal imports
import * as shell from "../lib/shell.js"
import * as worksets from "../lib/worksets.js"

export default {
    name: "my-suite",

    async run( t ) {
        t.check( "overview opens", await shell.showOverview() )
        t.check( "Work preview shows the Work wallpaper",
            worksets.previewWallpaper( worksets.previewForWorkspace( worksets.WORK.workspace ) ) ===
            worksets.loadedWallpaper( worksets.WORK.wallpaper ) )
        await t.screenshot( "overview" )
        await shell.hideOverview()
    },
}
```

Rules:

- **Give the actual value as the detail** of a check, so that a failure shows what happened: `t.check( name, condition, detail )`.
- **Read the options again after each change** with `worksets.options()`. `applySession()` can load the session file again, which replaces the options object.
- **Open menus as a user does**, with `shell.click()` on the panel icon, so that the test also covers the panel button.
- **Do not make new input devices in a suite.** `run-tests.js` calls `shell.prepareInput()` before the suites. GNOME Shell treats the first events of a new virtual pointer differently: an open menu takes its first click as a click outside the menu and closes.
- **Check the click result.** `shell.click()` gives `{ hit, picked }`. `hit` is false when another actor is below the pointer.
- **Put back the state** that a suite changes, in a `finally` block. Close each test window there with its `close()` function, because GNOME keeps the workspace of a window.
- **Use `t.skip()`** when the environment cannot run a check, for example when GNOME shows no thumbnails.
- **Wait for conditions** with `shell.waitFor()` and not only with fixed sleeps. GNOME Shell 51 loads wallpapers in the background.
- Do not export functions with an underscore in their name from `run-tests.js`. `scripting.js` calls them as performance event handlers.
- Run `pnpm run lintfix` after changes. ESLint also checks these files.

## Troubleshooting

- **Exit code 2, "The test run did not complete".** Look at the end of `out/shell.log`. Usual causes: GNOME Shell could not start the headless backend (no render node), or the time-out occurred (use `--timeout`).
- **"the extension under test is active" fails.** Look for `Extension ... had error` in `out/shell.log` and for `!ERROR` in `out/debug.log`. A syntax error in the extension stops it from loading.
- **The run fails only because of GNOME Shell log lines.** The runner prints the lines. Find the cause in the extension, or, if a line comes from the test environment (for example a missing system service), add a pattern to [`fixtures/ignored-log-patterns.txt`](fixtures/ignored-log-patterns.txt). Use `--allow-warnings` to see the check results without the log check.

## References

- GNOME Shell automation script support: [`js/ui/scripting.js`](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/scripting.js) and the performance test [`js/perf/basic.js`](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/perf/basic.js)
- [Automated testing of GNOME Shell](https://blogs.gnome.org/shell-dev/?p=2652) (GNOME Shell development blog)
- [Extension guide](https://gjs.guide/extensions/) and [GNOME API documentation](https://gjs-docs.gnome.org/)
- Main project [README](../../README.md)
