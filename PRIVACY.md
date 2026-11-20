# Privacy Policy — Discord Auto Quest

**Last Updated:** 2026-11-20

## Overview

Discord Auto Quest ("the Extension") is a Manifest V3 browser extension maintained by [wanng](https://github.com/wanngxuanji/Discord-Auto-Quest) that automates Discord Quest progress on Discord Web.

## Data Collection

**The Extension does not collect, store, sell, or transmit any personal or user data.**

Specifically, the Extension does **not**:
- Collect personal identifiers, account credentials, tokens, messages, or browsing history
- Use analytics, telemetry, crash reporting, or tracking pixels
- Send any data to third-party servers, external APIs, or external CDNs
- Persist user data in `localStorage`, `sessionStorage`, or `chrome.storage`

## Local Operation & Network Requests

All extension logic runs locally inside your browser:
- **Header & Client Hint Spoofing:** Uses `declarativeNetRequest` (`rules/headers.json`) and a `MAIN`-world script (`src/content/user-agent-override.js`) on `*.discord.com` to present desktop-client headers.
- **Quest Automation:** When triggered by the user on `/quest-home`, `src/background/service-worker.js` injects `src/content/quest-runner.js` into the active Discord tab so your browser can send quest progress updates directly to Discord's own API endpoints (`/quests/{id}/video-progress` and `/quests/{id}/heartbeat`).
- **UI & Audio Assets:** The floating Shadow DOM widget, toolbar popup (`src/popup/`), inline SVG icons, and completion sound (`assets/sfx/ting.mp3`) are all bundled locally inside the extension package with zero external network requests.

## Permissions Used

- **`host_permissions` (`https://*.discord.com/*`):** Required to run content scripts on Discord pages (`discord.com`, `canary.discord.com`, `ptb.discord.com`), read the current tab URL only on Discord domains for popup state, and modify request headers for Discord requests.
- **`declarativeNetRequestWithHostAccess`:** Required to apply `rules/headers.json` (`User-Agent` and `Sec-CH-UA*` headers) exclusively to Discord requests.
- **`scripting`:** Required by the background service worker to inject `src/content/quest-runner.js` into the verified Discord sender tab when the user clicks **Run Quests**.

## Third-Party Services

The Extension does not integrate with any third-party services or external CDNs. All network traffic initiated during automation goes exclusively to Discord's own domains as part of your active browser session.

## Contact

If you have questions about this Privacy Policy, please open an issue at [https://github.com/wanngxuanji/Discord-Auto-Quest](https://github.com/wanngxuanji/Discord-Auto-Quest).
