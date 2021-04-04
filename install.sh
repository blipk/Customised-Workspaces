#!/bin/bash
rm -f ./worksets@blipk.xyz/schemas/gschemas.compiled && glib-compile-schemas ./worksets@blipk.xyz/schemas
cp -r ./worksets@blipk.xyz ~/.local/share/gnome-shell/extensions/