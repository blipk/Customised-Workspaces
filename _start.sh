#!/bin/bash

./install.sh

# export G_MESSAGES_DEBUG=all
# export SHELL_DEBUG=all
export GNOME_SHELL_SLOWDOWN_FACTOR=2 # slow animations for debugging
export MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080

dbus-run-session -- gnome-shell --devkit --wayland