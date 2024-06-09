#!/bin/sh

shx mkdir -p dist/src/web/nextui
npm run build --prefix src/web/nextui

if [ -z "$NEXT_PUBLIC_PROMPTFOO_BUILD_STANDALONE_SERVER" ]; then
  shx cp -r src/web/nextui/out/* dist/src/web/nextui
fi
