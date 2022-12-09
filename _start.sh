#!/bin/bash
./install.sh
env GNOME_SHELL_SLOWDOWN_FACTOR=2 \ # slow animations for debugging
MUTTER_DEBUG_DUMMY_MODE_SPECS=1800x1000 \
dbus-run-session -- gnome-shell --nested --wayland