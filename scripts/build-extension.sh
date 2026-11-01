#!/bin/sh
# Builds the Chrome extension from the website's files into dist/extension,
# plus a zip for the Chrome Web Store.
set -e
cd "$(dirname "$0")/.."
rm -rf dist/extension && mkdir -p dist/extension/icons
cp extension/manifest.json extension/background.js dist/extension/
cp public/app.js public/icon.svg dist/extension/
# The web manifest and service worker are for the website only.
sed -e '/rel="manifest"/d' -e '/apple-touch-icon/d' public/index.html > dist/extension/index.html
for s in 16 32 48 128; do sips -z $s $s public/icon-512.png --out dist/extension/icons/$s.png >/dev/null; done
(cd dist/extension && rm -f ../devkit-extension.zip && zip -qr ../devkit-extension.zip .)
echo "Built dist/extension and dist/devkit-extension.zip"
