#!/bin/bash
# Compute SHA256 of appChooser.js and update the default value in the GSettings schema XML
# Called automatically by _package.sh before glib-compile-schemas

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPCHOOSER="$SCRIPT_DIR/worksets@blipk.xyz/lib/ui/appChooser.js"
SCHEMA="$SCRIPT_DIR/worksets@blipk.xyz/schemas/org.gnome.shell.extensions.worksets.gschema.xml"

if [ ! -f "$APPCHOOSER" ]; then
    echo "ERROR: appChooser.js not found at $APPCHOOSER"
    exit 1
fi

if [ ! -f "$SCHEMA" ]; then
    echo "ERROR: Schema file not found at $SCHEMA"
    exit 1
fi

HASH=$(sha256sum "$APPCHOOSER" | cut -d' ' -f1)

# Update the default value for appchooser-sha256 key in the schema XML
sed -i "s|\(<key name=\"appchooser-sha256\" type=\"s\">\s*\n\s*<default>\)\"[^\"]*\"|\1\"$HASH\"|" "$SCHEMA"

# Fallback: if the multiline sed didn't match, try single-line approach
if ! grep -q "$HASH" "$SCHEMA"; then
    sed -i "/<key name=\"appchooser-sha256\"/,/<\/key>/ s|<default>\"[^\"]*\"</default>|<default>\"$HASH\"</default>|" "$SCHEMA"
fi

if grep -q "$HASH" "$SCHEMA"; then
    echo "Updated appchooser-sha256 to: $HASH"
else
    echo "ERROR: Failed to update hash in schema file"
    exit 1
fi
