<p align="center"><img src="icon.svg" width="84" height="84" alt="QALens" /></p>

# QALens — Responsive Testing & Inspector

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
- **True device emulation** — beyond CSS width, picking a device also presents its
  **User-Agent**, **device-pixel-ratio**, and **touch / `pointer: coarse` / `hover`**
  traits to the page, so UA-sniffing sites and touch-only layouts render like the real
  device (see [Device emulation](#device-emulation-more-than-css-width) — needs
  **Proxy: On** for cross-origin apps).
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

## Device emulation (more than CSS width)

Resizing the frame changes the viewport width, which is what most `@media (width…)`
rules react to. But a real device differs in more ways, and sites often branch on them:

| Trait | What it drives | Emulated |
|-------|----------------|----------|
| Viewport **width** | `@media (min/max-width)` layout | ✅ always (frame size) |
| **User-Agent** + client hints | server/JS device detection, `navigator.userAgentData.mobile` | ✅ with Proxy On |
| **Device-pixel-ratio** | `window.devicePixelRatio`, `@media (resolution)` via `matchMedia` | ✅ with Proxy On |
| **Touch / pointer** | `navigator.maxTouchPoints`, `@media (pointer: coarse)`, `(hover: none)` | ✅ with Proxy On |

When you pick a device, the tool records that device's identity and — through the proxy
— **spoofs the request User-Agent** and **injects a tiny shim** that overrides
`devicePixelRatio`, `navigator.userAgent`/`userAgentData`, `maxTouchPoints`, and
resolution/pointer/hover `matchMedia` results. That's why a phone preset can flip a
UA-sniffing or touch-only site to its mobile UI instead of showing the desktop layout.

**This needs `Proxy: On`.** Your own app on `localhost:3000` is a *different origin*
from the tool, and browser security forbids a page from changing another origin's
User-Agent, DPR, or touch traits. The proxy makes the target same-origin, which is the
only way a pure-web tool can apply these. The status bar tells you the current state:
**"Emulating: iOS · touch · DPR 2"** (green, active) or **"Turn Proxy On to emulate …"**
(amber). Laptop/desktop presets keep your real browser identity by design.

> One honest gap: CSS-level `image-set()` / `<img srcset>` selection and canvas
> backing-store resolution use the *host* monitor's real pixel ratio — a page cannot
> override those. Everything JS- and `matchMedia`-visible is emulated.

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

## Deploying to the web (Vercel)

The tool can run as a hosted app at a `*.vercel.app` URL. The static UI and the
proxy are both served by a single serverless function ([api/proxy.js](api/proxy.js)),
configured by [vercel.json](vercel.json) — so **Proxy: On works on the deployed
URL too**, not just locally.

**Deploy**

- **Dashboard** — import the repo at [vercel.com/new](https://vercel.com/new). Set
  **Root Directory** to `responsive-testing` (this folder). No build command, no
  framework — it's a plain function + static files.
- **CLI** — from this folder: `npm i -g vercel` then `vercel` (and `vercel --prod`).

Once deployed, open `https://<your-app>.vercel.app/` — it redirects to the tool at
`/__app/`. Click **Proxy: Off → On** and load any URL.

> ⚠️ **Security — read before deploying publicly.** A hosted proxy that strips
> framing headers and forwards cookies for *any* target is effectively an **open
> proxy**, which can be abused by others and means traffic for sites you test
> passes through your deployment. Mitigations baked in:
> - A built-in **SSRF guard** refuses loopback / private / link-local /
>   cloud-metadata targets (set `RQA_ALLOW_PRIVATE=1` to disable). It matches the
>   literal hostname only — it does **not** resolve DNS, so it is not a complete
>   SSRF defense.
> - Because Vercel functions can't reach your machine, **testing your own
>   `localhost` won't work on the hosted version** — use the local proxy for that.
>
> For anything beyond personal use, put the deployment behind access control
> (e.g. Vercel password protection / auth) rather than leaving it open.

Note: serverless functions have response-size and execution-time limits (the
function is capped at `maxDuration: 30`s), so very large downloads or slow sites
may fail on the hosted version where they'd succeed under the local proxy.

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
| `api/proxy.js` | Same proxy as a Vercel serverless function (hosted deploys) |
| `vercel.json` | Vercel config — routes all traffic through the function |
| `start.cmd` | One-click launcher (Windows) |
| `start.sh` | One-command launcher (macOS / Linux) |

## Adding your own devices

Edit `devices.js` — each entry is `{ name, w, h, dpr, notch? }` where `w`/`h` are
CSS (logical) pixels, the same units your media queries use.
