#!/bin/bash
glib-compile-schemas ./worksets@blipk.xyz/schemas
#glib-compile-resources ./res/org.kronosoul.worksets.xml
#mv ./res/org.kronosoul.worksets.gresource ./worksets@blipk.xyz
zip -jr worksets@blipk.xyz.zip worksets@blipk.xyz
zip worksets@blipk.xyz.zip install.sh 'Install Customised Workspaces.desktop'