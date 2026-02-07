#!/bin/bash
rm -f ./worksets@blipk.xyz/schemas/gschemas.compiled
glib-compile-schemas ./worksets@blipk.xyz/schemas
rm -rf ~/.local/share/gnome-shell/extensions/worksets@blipk.xyz
cp -r ./worksets@blipk.xyz ~/.local/share/gnome-shell/extensions/
./_package.sh