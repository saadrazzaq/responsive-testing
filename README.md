# ResponsiveQA — Device & Breakpoint Tester

> Engineered by **Muhammad Saad Razzaq**

A lightweight, zero-install tool that helps SQA testers verify how an application
responds across modern devices and common resolutions. Just open `index.html` in a
browser — no build step, no dependencies. Runs on **Windows, macOS and Linux**.

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
- **Selectors (for automation testers)** — SelectorsHub-style locator generation.
  Pick/select an element and get a ranked list of **short, readable relative
  XPaths**, with the most robust one marked **★ Recommended**:
  - Relative XPath by `id`, by test attributes (`data-testid`, `data-cy`, `name`,
    `aria-label`, `placeholder`, `title`…), by visible **text** (`text()` /
    `contains()` / `normalize-space()`), and by **class** (exact + `contains`).
  - **Attribute combinations** (`//tag[@a='x' and @b='y']`) and locators relative
    to the nearest anchored ancestor (`//*[@id='…']//tag[…]`).
  - An **indexed fallback** (`(//…)[n]`) that guarantees a unique match when a
    readable locator matches several elements.
  - Absolute XPath and CSS selectors as secondary options.

Each candidate shows a **unique** badge (matches exactly one element — safe to
automate) or **N matches** (ambiguous), and ranks by robustness so the cleanest,
most stable locator is at the top with one-click **Copy**.

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

The proxy is plain **Node.js**, so it runs on **Windows, macOS and Linux**.

- **Windows** — double-click **`start.cmd`**.
- **macOS / Linux** — run **`bash start.sh`** (or `chmod +x start.sh && ./start.sh`).
- **Any OS, manually** — run **`node proxy.js --open`** in this folder.

Each of these starts the proxy and opens the tool at
`http://localhost:8090/__app/`. Then in the toolbar click **`Proxy: Off`** so it
turns **`Proxy: On`** (green), type any URL and hit **Load** — sites that
previously refused now render. Leave the proxy terminal/window open while testing.

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
| `start.cmd` | One-click launcher (Windows) |
| `start.sh` | One-command launcher (macOS / Linux) |

## Adding your own devices

Edit `devices.js` — each entry is `{ name, w, h, dpr, notch? }` where `w`/`h` are
CSS (logical) pixels, the same units your media queries use.
