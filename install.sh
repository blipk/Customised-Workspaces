#!/bin/bash
./_package.sh
rm -rf ~/.local/share/gnome-shell/extensions/worksets@blipk.xyz
cp -r ./worksets@blipk.xyz ~/.local/share/gnome-shell/extensions/
