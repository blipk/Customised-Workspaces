#!/bin/bash
rm -f ./worksets@blipk.xyz/schemas/gschemas.compiled
glib-compile-schemas ./worksets@blipk.xyz/schemas
#glib-compile-resources ./res/org.kronosoul.worksets.xml
#mv ./res/org.kronosoul.worksets.gresource ./worksets@blipk.xyz
cd worksets@blipk.xyz
zip -r ../worksets@blipk.xyz.zip *
cd ..
#zip worksets@blipk.xyz.zip install.sh 'Install Customised Workspaces.desktop'