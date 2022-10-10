#!/bin/bash
rm -f ./worksets@blipk.xyz/schemas/gschemas.compiled
glib-compile-schemas ./worksets@blipk.xyz/schemas
rm -rf worksets@blipk.xyz.zip
cd worksets@blipk.xyz
zip -r ../worksets@blipk.xyz.zip *
cd ..
#zip worksets@blipk.xyz.zip install.sh 'Install Customised Workspaces.desktop'