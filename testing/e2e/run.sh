#!/usr/bin/env bash
# End-to-end tests for the Customised Workspaces extension.
#
# Starts an isolated headless GNOME Shell with the extension from this working tree, and runs
# the test suites with the GNOME Shell automation script support (--automation-script).
# The test session has its own D-Bus session bus, settings, data and runtime directories, thus
# the desktop session of the user is not changed. See testing/e2e/README.md.

set -uo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$E2E_DIR/../.." && pwd)"
EXTENSION_UUID="worksets@blipk.xyz"
WAYLAND_DISPLAY_NAME="wayland-worksets-e2e"
VIRTUAL_MONITOR="1920x1080"
# Unix socket paths must be shorter than 108 bytes, thus the runtime directory needs a short path
RUNTIME_DIR_TEMPLATE="/tmp/wse2e.XXXXXX"

EXIT_PASS=0
EXIT_FAIL=1
EXIT_SETUP_ERROR=2

OUTPUT_DIR="$E2E_DIR/out"
SUITES=""
TIMEOUT_SECONDS=300
ALLOW_WARNINGS=false

usage() {
    cat <<EOF
Usage: $(basename "$0") [options]

Runs the end-to-end tests in an isolated headless GNOME Shell.

Options:
  -s, --suites NAMES    Run only these suites (comma separated), for example "startup,disable"
  -o, --output DIR      Directory for results, logs and screenshots (default: testing/e2e/out)
  -t, --timeout SECONDS Stop GNOME Shell after this time (default: $TIMEOUT_SECONDS)
      --allow-warnings  Do not fail when GNOME Shell logs JS errors, criticals or warnings
                        (fixtures/ignored-log-patterns.txt lists lines that never count)
  -h, --help            Show this help

Exit codes: $EXIT_PASS all checks passed, $EXIT_FAIL checks failed, the extension logged errors
            or GNOME Shell logged warnings, $EXIT_SETUP_ERROR the test run did not complete.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -s|--suites) SUITES="$2"; shift 2 ;;
        -o|--output) OUTPUT_DIR="$2"; shift 2 ;;
        -t|--timeout) TIMEOUT_SECONDS="$2"; shift 2 ;;
        --allow-warnings) ALLOW_WARNINGS=true; shift ;;
        -h|--help) usage; exit "$EXIT_PASS" ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit "$EXIT_SETUP_ERROR" ;;
    esac
done

for command in gnome-shell dbus-run-session dconf glib-compile-schemas timeout; do
    if ! command -v "$command" > /dev/null; then
        echo "Missing required command: $command" >&2
        exit "$EXIT_SETUP_ERROR"
    fi
done

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
WORK_DIR="$OUTPUT_DIR/work"
SCREENSHOT_DIR="$OUTPUT_DIR/screenshots"
RESULTS_FILE="$OUTPUT_DIR/results.txt"
SHELL_LOG="$OUTPUT_DIR/shell.log"
DEBUG_LOG="$OUTPUT_DIR/debug.log"
EXTENSION_DIR="$WORK_DIR/data/gnome-shell/extensions/$EXTENSION_UUID"
EXTENSION_CONFIG_DIR="$WORK_DIR/config/$EXTENSION_UUID"
DCONF_SETTINGS_FILE="$WORK_DIR/dconf-settings"
WALLPAPER_DIR="$E2E_DIR/fixtures/wallpapers"

# Prepare the isolated home directories
rm -rf "$WORK_DIR" "$SCREENSHOT_DIR" "$RESULTS_FILE" "$SHELL_LOG" "$DEBUG_LOG"
mkdir -p "$(dirname "$EXTENSION_DIR")" "$EXTENSION_CONFIG_DIR" "$WORK_DIR/cache" "$SCREENSHOT_DIR"

cp -r "$REPO_DIR/$EXTENSION_UUID" "$EXTENSION_DIR"
glib-compile-schemas "$EXTENSION_DIR/schemas"

# fill_template TEMPLATE OUTPUT: replaces the @NAME@ placeholders of the fixtures
fill_template() {
    local content
    content="$(< "$1")"
    content="${content//@WALLPAPER_DIR@/$WALLPAPER_DIR}"
    content="${content//@EXTENSION_UUID@/$EXTENSION_UUID}"
    printf '%s\n' "$content" > "$2"
}
fill_template "$E2E_DIR/fixtures/session.template.json" "$EXTENSION_CONFIG_DIR/session.json"
fill_template "$E2E_DIR/fixtures/dconf-settings.template" "$DCONF_SETTINGS_FILE"

RUNTIME_DIR="$(mktemp -d "$RUNTIME_DIR_TEMPLATE")"
chmod 700 "$RUNTIME_DIR"
cleanup() {
    # D-Bus activated FUSE daemons (for example the document portal) can leave mounts in the runtime directory
    local mountPoint
    for mountPoint in $(grep -F "$RUNTIME_DIR" /proc/mounts | cut -d " " -f 2); do
        fusermount3 -uz "$mountPoint" 2> /dev/null || fusermount -uz "$mountPoint" 2> /dev/null
    done
    rm -rf "$RUNTIME_DIR"
}
trap cleanup EXIT

export XDG_CONFIG_HOME="$WORK_DIR/config"
export XDG_DATA_HOME="$WORK_DIR/data"
export XDG_CACHE_HOME="$WORK_DIR/cache"
export XDG_RUNTIME_DIR="$RUNTIME_DIR"
export GIO_USE_VFS="local"
export WSE2E_RESULTS_FILE="$RESULTS_FILE"
export WSE2E_SCREENSHOT_DIR="$SCREENSHOT_DIR"
export WSE2E_WALLPAPER_DIR="$WALLPAPER_DIR"
export WSE2E_SUITES="$SUITES"
unset DISPLAY WAYLAND_DISPLAY

echo "Running the end-to-end tests in a headless $(gnome-shell --version)"
echo "Output: $OUTPUT_DIR"
# The private session bus starts a private dconf service that uses XDG_CONFIG_HOME/dconf/user
dbus-run-session -- bash -c '
    dconf load / < "$1" || exit '"$EXIT_SETUP_ERROR"'
    exec timeout "$2" gnome-shell --headless --no-x11 --force-animations \
        --virtual-monitor "$3" --wayland-display "$4" --automation-script "$5"
' run-shell "$DCONF_SETTINGS_FILE" "$TIMEOUT_SECONDS" "$VIRTUAL_MONITOR" "$WAYLAND_DISPLAY_NAME" "$E2E_DIR/run-tests.js" \
    > "$SHELL_LOG" 2>&1
SHELL_STATUS=$?

cp "$EXTENSION_CONFIG_DIR/debug.log" "$DEBUG_LOG" 2> /dev/null || : > "$DEBUG_LOG"

# count_matches PATTERN FILE: number of lines that match an extended regular expression
count_matches() {
    grep -c -E "$1" "$2" 2> /dev/null || true
}

# shell_warnings: the JS errors, JS warnings, criticals and warnings of the shell log,
# without the lines that fixtures/ignored-log-patterns.txt ignores
SHELL_WARNING_PATTERN='JS ERROR|JS WARNING|-CRITICAL \*\*|-WARNING \*\*'
shell_warnings() {
    grep -E "$SHELL_WARNING_PATTERN" "$SHELL_LOG" 2> /dev/null \
        | grep -v -E -f <(grep -v -E '^[[:space:]]*(#|$)' "$E2E_DIR/fixtures/ignored-log-patterns.txt")
}

PASS_COUNT="$(count_matches '^PASS ' "$RESULTS_FILE")"
FAIL_COUNT="$(count_matches '^FAIL ' "$RESULTS_FILE")"
SKIP_COUNT="$(count_matches '^SKIP ' "$RESULTS_FILE")"
EXTENSION_ERROR_COUNT="$(count_matches '!ERROR' "$DEBUG_LOG")"
SHELL_WARNING_COUNT="$(shell_warnings | wc -l)"

echo
echo "== Results (GNOME Shell exit code $SHELL_STATUS)"
grep -E '^(NOTE|FAIL|SKIP|DONE) ' "$RESULTS_FILE" 2> /dev/null
echo "${PASS_COUNT:-0} passed, ${FAIL_COUNT:-0} failed, ${SKIP_COUNT:-0} skipped"

echo
echo "== Extension debug log: ${EXTENSION_ERROR_COUNT:-0} errors ($DEBUG_LOG)"
grep -A8 '!ERROR' "$DEBUG_LOG" 2> /dev/null | head -100

echo
echo "== GNOME Shell log: ${SHELL_WARNING_COUNT:-0} JS errors, criticals or warnings ($SHELL_LOG)"
shell_warnings | head -40

if ! grep -q '^DONE ' "$RESULTS_FILE" 2> /dev/null; then
    echo
    echo "The test run did not complete. End of the GNOME Shell log:"
    tail -20 "$SHELL_LOG"
    exit "$EXIT_SETUP_ERROR"
fi
if [[ "${FAIL_COUNT:-0}" -gt 0 || "${EXTENSION_ERROR_COUNT:-0}" -gt 0 ]]; then
    exit "$EXIT_FAIL"
fi
if [[ "$ALLOW_WARNINGS" != true && "${SHELL_WARNING_COUNT:-0}" -gt 0 ]]; then
    exit "$EXIT_FAIL"
fi
exit "$EXIT_PASS"
