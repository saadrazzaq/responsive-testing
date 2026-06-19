# ResponsiveQA — Device & Breakpoint Tester

A lightweight, zero-install tool that helps SQA testers verify how an application
responds across modern devices and common resolutions. Just open `index.html` in a
browser — no build step, no dependencies.

## Quick start

1. Double-click **`index.html`** (or serve the folder — see below).
2. Click **"Try the demo page"** to see it working, or type your app's URL
   (e.g. `http://localhost:3000`) and hit **Load**.
3. Pick a device from the strip, or drag the right/bottom edge to resize freely.

## Features

- **Device presets** — current iPhones, Pixels, Galaxy, iPads, Surface, MacBooks,
  and standard desktop resolutions (1080p, 1440p, 4K), grouped by category.
- **Drag-to-resize** — grab the right, bottom, or corner handle to test any width.
  The active breakpoint updates live.
- **Breakpoint ruler** — common CSS breakpoints (320 → 1920) with a colored cursor
  marking your current width.
- **Orientation toggle** — rotate portrait ⇆ landscape (or press `R`).
- **Auto-fit zoom** — large viewports scale to fit your screen; zoom is adjustable.
- **Gallery mode** — see every device in a category side-by-side at once (press `G`).
- **Dark / light theme**, DPR + dimension readouts in the status bar.

## Inspector (Network · Elements · Selectors)

Click the **Inspector** icon in the toolbar to open a DevTools-style side panel.
These features read the previewed page's DOM and network activity, so they
require the page to be **same-origin** — i.e. **Proxy: On** (or testing a page
already served from the tool's origin).

- **Network** — toggle **Record** on, then interact with the page to capture its
  `fetch` / `XHR` calls (method, status, type, size, time). Filter by URL, clear,
  and it only records while Record is on.
- **Elements** — a live, collapsible DOM tree. Hover to highlight in the preview,
  or use **Pick element** to click any element directly in the page.
- **Selectors (for automation testers)** — pick/select an element and instantly get
  ready-to-use locators, each with a **uniqueness check** and one-click **Copy**:
  - XPath by `id`, by test attributes (`data-testid`, `data-cy`, `name`, `aria-label`…),
    by visible text, and an absolute XPath.
  - CSS selectors (by id, tag+classes, and a full nth-of-type path).

A **unique** badge means the locator matches exactly one element (safe for
automation); **N matches** warns it is ambiguous.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `R` | Rotate orientation |
| `+` / `-` | Zoom in / out |
| `0` | Reset to auto-fit |
| `G` | Toggle gallery mode |

## Testing sites that block embedding (the proxy)

This tool previews pages inside an `<iframe>`. Many sites send
`X-Frame-Options` or `Content-Security-Policy: frame-ancestors` headers that tell
the browser "never embed me" — so they show **"refused to connect."** That's the
site's policy, not a bug in the tool, and no client-side code can override it.

There's also a second, subtler problem: modern sites are **single-page apps** that
load their content by calling their own API *after* the page arrives. Even once the
HTML is embedded, those data calls are cross-origin and get blocked — so you see an
empty skeleton with no data.

To solve **both**, the project ships a tiny **local reverse proxy** (`proxy.js`,
zero dependencies, needs Node.js). It routes *everything* — the page, its scripts,
**and its API/data calls** — through `localhost`, so the app believes it's talking
to itself: framing headers are stripped and data loads normally.

### How to use it

1. **Double-click `start.cmd`** — it starts the proxy and opens the tool.
   (Or run `node proxy.js` in this folder and open `index.html` yourself.)
2. In the toolbar, click **`Proxy: Off`** so it turns **`Proxy: On`** (green).
3. Type any URL and hit **Load** — sites that previously refused now render.

Leave the small proxy console window open while you test.

### What works / what doesn't through the proxy

- ✅ **Static & server-rendered sites** — marketing pages, blogs, stores: render fully.
- ✅ **Data-driven SPAs** — the page *and* its API calls route through localhost, so
  content/data loads (the proxy rewrites the site's own URLs to stay same-origin).
- ⚠️ **Heavily locked-down apps** (e.g. YouTube, banking, some OAuth flows) — usually
  render and load most data, but may hit bot-detection challenges, WebSocket-only
  features, or third-party-host APIs that the proxy can't keep same-origin. These are
  edge cases; the proxy can't defeat anti-bot systems by design.
- 🔒 **Authenticated sessions** — the proxy forwards cookies, so logging in through it
  generally works, but treat credentials carefully (traffic passes through the proxy).

### You usually don't need the proxy for your own app

When testing your own application on `localhost` or a staging URL you control, it
typically doesn't send framing-blocker headers, so it loads **without** the proxy.
The proxy is mainly for third-party / production sites that lock down framing.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell / markup |
| `styles.css` | Styling + light/dark themes |
| `devices.js` | Device & breakpoint database (edit to add devices) |
| `app.js` | Application logic |
| `demo.html` | Sample responsive page for trying the tool |
| `inspector.js` | Network monitor, DOM tree, element picker & selector generator |
| `proxy.js` | Local proxy that unblocks sites which refuse to be framed |
| `start.cmd` | One-click launcher: starts the proxy + opens the tool (Windows) |

## Adding your own devices

Edit `devices.js` — each entry is `{ name, w, h, dpr, notch? }` where `w`/`h` are
CSS (logical) pixels, the same units your media queries use.
