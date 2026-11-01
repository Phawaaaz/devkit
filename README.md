# DevKit

20 developer tools that run entirely in your browser: https://devkit-ng.vercel.app

JSON · JWT decoder · Base64 · URL · Timestamp · UUID · Hash · Regex tester · Cron explainer · Password ·
Text diff · JSON to TypeScript · JSON ↔ CSV · Case converter · Color · Number base · HTTP status codes ·
Fake data (Nigerian test users) · HMAC / webhook signature · cURL to fetch

No build step and no dependencies. A Content-Security-Policy (`connect-src 'self'`, no inline scripts)
means nothing you paste can be sent anywhere. Works offline as a PWA.

## Layout

- `public/`: the website (`index.html`, `app.js`, service worker, icons). Deploy this folder.
- `extension/`: Chrome extension manifest and background script.
- `scripts/build-extension.sh`: builds `dist/extension/` and `dist/devkit-extension.zip` from both.

## Chrome extension

Toolbar button (or Alt+Shift+D) opens DevKit in a tab. Select text on any page, right-click,
**Open in DevKit**, and it opens the right tool with your text filled in (JWTs, JSON, timestamps, cURL,
Base64…). The only permission is `contextMenus`; the text is passed in the page hash and never leaves
the browser.

```sh
./scripts/build-extension.sh
```

Then in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → `dist/extension`.
Upload `dist/devkit-extension.zip` to the Chrome Web Store when publishing.

## Run locally

```sh
cd public && python3 -m http.server 5301
```
