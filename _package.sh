#!/bin/bash
# Update appChooser.js SHA256 hash in schema before compiling
bash "$(dirname "$0")/_update-appchooser-hash.sh"
rm -f ./worksets@blipk.xyz/schemas/gschemas.compiled
glib-compile-schemas ./worksets@blipk.xyz/schemas
rm -rf worksets@blipk.xyz.zip
cd worksets@blipk.xyz
bsdtar -a -cf ../worksets@blipk.xyz.zip --exclude 'lib/ui/shader.js' *
cd ..
#zip worksets@blipk.xyz.zip install.sh 'Install Customised Workspaces.desktop'