#!/bin/bash
./_package.sh
./install.sh
dbus-run-session -- gnome-shell --nested --wayland