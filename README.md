# Vindows

A lightweight extension that detects videos on any page and opens them in Picture‑in‑Picture (PiP) with one click. It supports multiple languages, keyboard shortcuts, and resilient re‑detection so you can pop out videos at any time.

## Features

- Auto‑detects video elements (incl. live streams and common players)
- One‑click PiP
- Toolbar icon indicates detection state; badge shows count when multiple
- Keyboard shortcut (recommended default: Alt+Shift+V; customise in chrome://extensions/shortcuts)
- Auto re‑scan on DOM changes, tab switches, and window focus
- Localised UI: Chinese (Simplified/Traditional), English (US/UK), Russian, Hindi, Japanese

## Usage

1. Pin the extension icon to the toolbar.
2. When the icon is coloured, a playable video is detected. Click the popup button to open PiP.
3. Or use the keyboard shortcut (e.g. Alt+Shift+V). If it conflicts with your system, set a different one in `chrome://extensions/shortcuts`.
4. After closing PiP or switching tabs, the extension refreshes detection automatically.

Note: Some sites or videos may block PiP via policies (e.g., `disablePictureInPicture`), DRM, embedded PDF, or `chrome://` pages. In such cases, opening PiP will fail by design.

## Permissions

- tabs / activeTab: target the active tab and send PiP/scan messages
- scripting: inject content scripts to detect videos and request PiP
- notifications: show notifications when PiP cannot be opened or no video detected
- host_permissions: `<all_urls>` to enable detection across most sites

Processing happens locally; no personal data is collected or transmitted. See Privacy Policy for details.

## Shortcuts

- Recommended: Alt+Shift+V (customise in `chrome://extensions/shortcuts`)
- If occupied (e.g., Alt+Shift for IME switching), try Alt+Shift+P / O / X, etc.

## Localisation (i18n)

The extension follows your browser language:

- Chinese (Simplified, zh_CN)
- Chinese (Traditional, zh_TW)
- English (US)
- English (UK)
- Russian (ru)
- Hindi (hi)
- Japanese (ja)

## FAQ

- “Button works but shortcut doesn’t”: set a non‑conflicting shortcut and ensure the browser window/tab is focused.
- “Needs a user gesture”: click the page or player once, then try again.
- “Some sites always fail”: likely due to site policy or DRM; cannot be bypassed.

## Support

For feature requests or issues, use the extension store feedback channel or open an issue (if the repo is public).
