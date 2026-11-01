# ORIN Saver — Safari support

Safari runs the same Chrome MV3 extension. No separate code tree is needed.
On Safari 26+ (macOS 26), extensions can be loaded temporarily straight from
this directory — no Xcode required. The Xcode route is only needed for iOS
testing or App Store distribution.

## Local development — no Xcode (Safari 26+, macOS 26)

1. In Safari: **Safari → Settings → Advanced** → check **"Show features for
   web developers"**. This adds a **Developer** tab in Settings.
2. On that **Developer** tab, click **Add Temporary Extension** and select the
   `apps/orin-extension` folder.
3. The extension is unsigned, so also on the Developer tab, check **"Allow
   unsigned extensions"** (Safari re-disables this after each restart —
   re-check it and reload the extension if it disappears from Settings).
4. Grant website access: **Safari → Settings → Extensions → ORIN Saver** —
   set your ORIN origin (and pages you save) to Allow, or use "All Websites".
   Safari otherwise shows a toolbar badge asking for access on first use.
5. Sign in to ORIN once in Safari (same GitHub flow as Chrome) so the
   extension shares the session cookie, then set the ORIN origin in the
   extension's options page (right-click the toolbar button → ORIN Saver
   Settings). Temporary extensions may need this re-done after each reload.
6. Reload the extension files after code changes: on the same Developer tab,
   remove and re-add the extension folder (Safari does not hot-reload).

If your Safari has no "Add Temporary Extension" button (pre-Safari 26), use
the Xcode path below instead.

## Distribution / iOS (requires Xcode)

`xcrun safari-web-extension-converter` (older Xcode) or
`xcrun safari-web-extension-packager --copy-resources` (Xcode 26+) packages
the extension into an app wrapper:

```sh
sh apps/orin-extension/scripts/safari-convert.sh
```

This creates an Xcode project under `safari/` (gitignored — regenerate on
each machine rather than committing build output). TestFlight/App Store
distribution goes through the generated project (or App Store Connect's
Safari Web Extension Packager without a Mac); for personal use, loading the
folder directly in Safari is enough. Full Xcode only ships the
`converter`/`packager` tools, not Command Line Tools.

## Safari compatibility notes

- Requires Safari 16.4 or later (declarativeNetRequest `modifyHeaders`
  support; earlier Safari versions cannot strip the `Origin` header and every
  save would be rejected with 403).
- The manifest declares `declarativeNetRequestWithHostAccess` in addition to
  `declarativeNetRequest`: Safari treats that permission as the requirement
  for `modifyHeaders` rules (Apple documentation), while Chrome accepts both.
- The dynamic "strip Origin" rule uses a `regexFilter` + `resourceTypes`
  condition instead of `requestDomains`/`requestMethods`, which Safari's
  condition support is documented around. `/api/orin/` GETs match too, which
  is harmless — the server's same-origin guard only covers writes.
- Safari does not attach HttpOnly session cookies to fetches from the
  extension's background service worker, so the direct save path cannot
  authenticate there even while the user is signed in. The extension
  therefore falls back to running the save inside an ORIN tab's own page
  context (`lib/in-page-saver.js`): a same-origin fetch from the browser
  attaches cookies normally and the Origin header matches without any DNR
  rule. It prefers an ORIN tab you already have open; otherwise it briefly
  opens a hidden one and closes it. Chrome never takes this path.
- Categories share the same limitation and are served from a cache that is
  refreshed every time a Safari save runs, so the dropdown may say
  "Categories unavailable" until the first successful save of a session.
- Website access must be **Allow** (not Ask) for the ORIN origin, so the
  extension can inject the saver script into that tab; Safari otherwise
  prompts during the first tab-based save.
- The configured ORIN origin must be the ORIN Node service
  (`https://orin-digest.onrender.com` by default) — the static portfolio site
  cannot run `POST /api/orin/contributions` and is redirected to the Node
  service by the UI; the extension talks to the Node origin directly.
- Safari requires the user to grant website access per site (or globally)
  before fetches read/write cookies; this is the equivalent of Chrome's host
  permission prompt and cannot be bypassed from the extension itself. This
  applies equally to temporarily loaded extensions.
- `chrome.storage.sync` works but Safari does not sync it across devices; the
  ORIN origin setting is effectively per-device.
