#!/bin/sh -e

shx mkdir -p dist/src/web/nextui
npm run build --prefix src/web/nextui

shx cp -r src/web/nextui/out/* dist/src/web/nextui
