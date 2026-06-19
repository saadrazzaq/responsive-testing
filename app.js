/* ============================================================
   QALens — app logic
   ============================================================ */
(function () {
  "use strict";

  // Self-heal: remove any service workers a previously-proxied site (e.g.
  // YouTube) may have registered on this origin — they hijack navigations
  // and cause "redirected too many times" loops.
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    }
  } catch (e) {}

  // ---------- State ----------
  const state = {
    url: "",
    width: 1280,
    height: 800,
    dpr: 2,
    name: "MacBook Air 13\"",
    category: "laptop",
    zoom: 1,
    autoZoom: true,     // fit-to-stage until user changes zoom manually
    ruler: true,
    gallery: false,
    notch: false,
    proxy: false,
  };

  // When the tool is served BY the proxy (http://localhost:8090/__app/), use
  // same-origin relative URLs so the proxy's cookie is first-party and flows
  // back. If opened from file:// instead, fall back to the absolute origin
  // (the proxy still strips framing, but cookie-based data routing won't work —
  // the tool warns about this when proxy mode is enabled).
  const SERVED_BY_PROXY = /^https?:\/\/(localhost|127\.0\.0\.1):8090$/.test(location.origin);
  const PROXY_BASE = SERVED_BY_PROXY ? "" : "http://localhost:8090";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    urlForm: $("urlForm"), urlInput: $("urlInput"),
    reloadBtn: $("reloadBtn"), themeBtn: $("themeBtn"),
    categoryPills: $("categoryPills"), deviceStrip: $("deviceStrip"),
    widthInput: $("widthInput"), heightInput: $("heightInput"), swapBtn: $("swapBtn"),
    zoomIn: $("zoomIn"), zoomOut: $("zoomOut"), zoomValue: $("zoomValue"),
    rulerBtn: $("rulerBtn"), galleryBtn: $("galleryBtn"),
    stage: $("stage"), ruler: $("ruler"),
    viewportArea: $("viewportArea"), gallery: $("gallery"),
    deviceFrame: $("deviceFrame"), deviceShell: $("deviceShell"),
    frameInner: $("frameInner"), previewFrame: $("previewFrame"),
    framePlaceholder: $("framePlaceholder"),
    metaName: $("metaName"), metaDim: $("metaDim"), metaBp: $("metaBp"),
    statusDim: $("statusDim"), statusBp: $("statusBp"), statusDpr: $("statusDpr"),
  };

  // ============================================================
  //  URL handling
  // ============================================================
  function normalizeUrl(raw) {
    let v = raw.trim();
    if (!v) return "";
    // Leave protocols, root-relative, relative, and bare filenames as-is.
    if (/^(https?:|file:|\/|\.|[\w-]+\.html?$)/i.test(v)) return v;
    return "http://" + v;
  }

  // Route through the local proxy only for absolute http(s) URLs when proxy mode is on.
  function frameSrc(url) {
    if (state.proxy && /^https?:\/\//i.test(url)) {
      return PROXY_BASE + "/__rqa/go?url=" + encodeURIComponent(url);
    }
    return url;
  }

  function loadUrl(raw) {
    const url = normalizeUrl(raw);
    state.url = url;
    if (!url) {
      el.previewFrame.src = "about:blank";
      el.framePlaceholder.style.display = "flex";
      return;
    }
    el.framePlaceholder.style.display = "none";
    el.previewFrame.src = frameSrc(url);
    if (state.gallery) renderGallery();
  }

  el.urlForm.addEventListener("submit", (e) => {
    e.preventDefault();
    loadUrl(el.urlInput.value);
  });

  const loadDemoBtn = document.getElementById("loadDemoBtn");
  if (loadDemoBtn) loadDemoBtn.addEventListener("click", () => {
    el.urlInput.value = "demo.html";
    loadUrl("demo.html");
  });

  el.reloadBtn.addEventListener("click", () => {
    if (!state.url) return;
    el.previewFrame.src = "about:blank";
    requestAnimationFrame(() => { el.previewFrame.src = frameSrc(state.url); });
    if (state.gallery) renderGallery();
  });

  // ============================================================
  //  Proxy toggle (bypass X-Frame-Options / CSP framing blocks)
  // ============================================================
  const proxyBtn = document.getElementById("proxyBtn");
  const proxyLabel = document.getElementById("proxyLabel");

  function setProxyVisual() {
    proxyBtn.classList.toggle("on", state.proxy);
    proxyBtn.classList.remove("unreachable");
    proxyLabel.textContent = state.proxy ? "Proxy: On" : "Proxy: Off";
  }

  async function proxyReachable() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(PROXY_BASE + "/__rqa/health", { signal: ctrl.signal });
      clearTimeout(t);
      return r.ok;
    } catch (e) { return false; }
  }

  proxyBtn.addEventListener("click", async () => {
    if (!state.proxy) {
      if (!SERVED_BY_PROXY) {
        const go = confirm(
          "For full proxy support (loading site data), open the tool from the proxy:\n\n" +
          "    http://localhost:8090/__app/\n\n" +
          "You're currently on " + location.origin + ", where the browser blocks the\n" +
          "proxy's cookie, so sites may show an empty layout.\n\n" +
          "Tip: just run start.cmd — it opens the right address automatically.\n\n" +
          "OK = open the correct address now   ·   Cancel = continue anyway"
        );
        if (go) { window.location.href = "http://localhost:8090/__app/"; return; }
      }
      const ok = await proxyReachable();
      if (!ok) {
        proxyBtn.classList.add("unreachable");
        proxyLabel.textContent = "Proxy: not running";
        alert(
          "The local proxy isn't running.\n\n" +
          "Start it first:\n" +
          "  • Double-click  start.cmd  (starts proxy + opens the tool), or\n" +
          "  • Run  node proxy.js  in this folder.\n\n" +
          "Then click Proxy again."
        );
        return;
      }
      state.proxy = true;
    } else {
      state.proxy = false;
    }
    setProxyVisual();
    if (state.url) {
      el.previewFrame.src = "about:blank";
      requestAnimationFrame(() => { el.previewFrame.src = frameSrc(state.url); });
      if (state.gallery) renderGallery();
    }
  });

  // ============================================================
  //  Theme
  // ============================================================
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("rqa-theme", t); } catch (e) {}
  }
  el.themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "dark" ? "light" : "dark");
  });
  try {
    const saved = localStorage.getItem("rqa-theme");
    if (saved) setTheme(saved);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
  } catch (e) {}

  // ============================================================
  //  Category pills + device strip
  // ============================================================
  const ICONS = {
    phone:   '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>',
    tablet:  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>',
    laptop:  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1"/><line x1="2" y1="20" x2="22" y2="20"/></svg>',
    desktop: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  };

  function renderCategoryPills() {
    el.categoryPills.innerHTML = "";
    DEVICE_CATEGORIES.forEach((cat) => {
      const b = document.createElement("button");
      b.className = "cat-pill" + (cat.id === state.category ? " active" : "");
      b.innerHTML = ICONS[cat.icon] + "<span>" + cat.label + "</span>";
      b.addEventListener("click", () => {
        state.category = cat.id;
        renderCategoryPills();
        renderDeviceStrip();
        if (state.gallery) renderGallery();
      });
      el.categoryPills.appendChild(b);
    });
  }

  function renderDeviceStrip() {
    el.deviceStrip.innerHTML = "";
    const cat = DEVICE_CATEGORIES.find((c) => c.id === state.category);
    cat.devices.forEach((d) => {
      const active = d.name === state.name;
      const chip = document.createElement("button");
      chip.className = "dev-chip" + (active ? " active" : "");
      chip.innerHTML =
        '<span>' + d.name + '</span><span class="chip-dim">' + d.w + "×" + d.h + "</span>";
      chip.addEventListener("click", () => selectDevice(d));
      el.deviceStrip.appendChild(chip);
    });
  }

  function selectDevice(d) {
    state.name = d.name;
    state.width = d.w;
    state.height = d.h;
    state.dpr = d.dpr || 1;
    state.notch = !!d.notch;
    state.autoZoom = true;
    renderDeviceStrip();
    applyViewport();
  }

  // ============================================================
  //  Dimension inputs + orientation
  // ============================================================
  function syncInputs() {
    el.widthInput.value = state.width;
    el.heightInput.value = state.height;
  }

  function onDimChange() {
    const w = clamp(parseInt(el.widthInput.value, 10) || state.width, 200, 4000);
    const h = clamp(parseInt(el.heightInput.value, 10) || state.height, 200, 4000);
    state.width = w; state.height = h;
    state.name = "Custom";
    state.autoZoom = true;
    renderDeviceStrip();
    applyViewport();
  }
  el.widthInput.addEventListener("change", onDimChange);
  el.heightInput.addEventListener("change", onDimChange);

  el.swapBtn.addEventListener("click", () => {
    [state.width, state.height] = [state.height, state.width];
    state.autoZoom = true;
    applyViewport();
  });

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // ============================================================
  //  Zoom
  // ============================================================
  function fitZoom() {
    // available area inside stage (minus padding)
    const stageW = el.stage.clientWidth - 48 - 24;          // side padding + handle room
    const stageH = el.stage.clientHeight - (state.ruler ? 34 : 0) - 60; // ruler + meta + margins
    const zw = stageW / state.width;
    const zh = stageH / state.height;
    let z = Math.min(zw, zh, 1);          // never upscale past 100% automatically
    z = Math.max(z, 0.2);
    return Math.round(z * 100) / 100;
  }

  function setZoom(z, manual) {
    state.zoom = clamp(z, 0.2, 2);
    if (manual) state.autoZoom = false;
    applyViewport(true);
  }
  el.zoomIn.addEventListener("click", () => setZoom(state.zoom + 0.1, true));
  el.zoomOut.addEventListener("click", () => setZoom(state.zoom - 0.1, true));
  el.zoomValue.addEventListener("click", () => { state.autoZoom = false; setZoom(1, true); });

  // ============================================================
  //  Toggles
  // ============================================================
  el.rulerBtn.addEventListener("click", () => {
    state.ruler = !state.ruler;
    el.rulerBtn.setAttribute("data-on", String(state.ruler));
    el.ruler.classList.toggle("hidden", !state.ruler);
    if (state.autoZoom) applyViewport();
  });

  el.galleryBtn.addEventListener("click", () => {
    state.gallery = !state.gallery;
    el.galleryBtn.classList.toggle("active", state.gallery);
    el.viewportArea.hidden = state.gallery;
    el.gallery.hidden = !state.gallery;
    el.ruler.style.display = state.gallery ? "none" : "";
    if (state.gallery) renderGallery();
    else applyViewport();
  });

  // ============================================================
  //  Apply viewport (the core render)
  // ============================================================
  function applyViewport(zoomOnly) {
    if (state.autoZoom && !zoomOnly) state.zoom = fitZoom();

    const z = state.zoom;
    const w = state.width, h = state.height;

    // The inner frame is rendered at full logical size, then scaled.
    el.frameInner.style.width = w + "px";
    el.frameInner.style.height = h + "px";
    el.frameInner.style.transform = "scale(" + z + ")";
    el.frameInner.style.transformOrigin = "top left";

    // Shell must shrink to the scaled size so layout/centering is correct.
    el.deviceShell.style.width = w * z + 16 + "px";   // + padding (8*2)
    el.deviceShell.style.height = h * z + 16 + "px";
    el.frameInner.style.position = "absolute";
    el.frameInner.style.top = "8px";
    el.frameInner.style.left = "8px";

    el.deviceShell.classList.toggle("has-notch", state.notch);

    // Meta + status
    const bp = breakpointFor(w);
    el.metaName.textContent = state.name;
    el.metaDim.textContent = w + " × " + h;
    el.metaBp.textContent = bp.name;
    el.metaBp.style.background = bp.color;

    el.statusDim.textContent = w + " × " + h + " px";
    el.statusBp.textContent = "Breakpoint: " + bp.name + " (≥" + bp.min + "px)";
    el.statusDpr.textContent = "DPR " + state.dpr + " · " + Math.round(z * 100) + "% zoom";

    el.zoomValue.textContent = Math.round(z * 100) + "%";

    syncInputs();
    updateRuler();
  }

  // ============================================================
  //  Ruler
  // ============================================================
  let rulerTrack, rulerCursor;
  function buildRuler() {
    el.ruler.innerHTML = '<div class="ruler-track"></div>';
    rulerTrack = el.ruler.querySelector(".ruler-track");
  }

  function updateRuler() {
    if (!rulerTrack) buildRuler();
    if (!state.ruler) return;
    const trackW = rulerTrack.clientWidth || el.ruler.clientWidth - 48;
    const maxPx = Math.max(2000, state.width * 1.1);
    const toX = (px) => (px / maxPx) * trackW;

    let html = "";
    RULER_MARKS.forEach((m) => {
      if (m > maxPx) return;
      html += '<div class="ruler-mark" style="left:' + toX(m) + 'px"><span>' + m + "</span></div>";
    });
    // colored breakpoint cursor at current width
    const bp = breakpointFor(state.width);
    html += '<div class="ruler-cursor" style="left:' + toX(state.width) + "px;background:" + bp.color + '"></div>';
    rulerTrack.innerHTML = html;
  }

  // ============================================================
  //  Resize handles (drag to resize)
  // ============================================================
  let drag = null;
  function startDrag(dir, e) {
    e.preventDefault();
    drag = {
      dir,
      startX: e.clientX, startY: e.clientY,
      startW: state.width, startH: state.height,
      z: state.zoom,
    };
    el.deviceFrame.classList.add("resizing");
    state.name = "Custom";
    state.autoZoom = false;
    renderDeviceStrip();
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
  }
  function onDrag(e) {
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / drag.z;
    const dy = (e.clientY - drag.startY) / drag.z;
    if (drag.dir.includes("r")) state.width = clamp(Math.round(drag.startW + dx), 200, 4000);
    if (drag.dir.includes("b")) state.height = clamp(Math.round(drag.startH + dy), 200, 4000);
    applyViewport(true);
  }
  function endDrag() {
    drag = null;
    el.deviceFrame.classList.remove("resizing");
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
  }
  document.querySelectorAll(".handle").forEach((h) => {
    h.addEventListener("mousedown", (e) => startDrag(h.dataset.dir, e));
  });

  // ============================================================
  //  Gallery mode
  // ============================================================
  function renderGallery() {
    const cat = DEVICE_CATEGORIES.find((c) => c.id === state.category);
    el.gallery.innerHTML = "";
    const GALLERY_W = 280; // display width cap per tile
    cat.devices.forEach((d) => {
      const scale = Math.min(GALLERY_W / d.w, 1);
      const item = document.createElement("div");
      item.className = "gallery-item";
      const bp = breakpointFor(d.w);
      item.innerHTML =
        '<div class="gallery-head"><b>' + d.name + "</b><span>" + d.w + "×" + d.h +
        '</span><span style="color:' + bp.color + '">●</span></div>' +
        '<div class="gallery-shell" style="width:' + (d.w * scale + 12) + "px;height:" + (d.h * scale + 12) + 'px">' +
        '</div>';
      const shell = item.querySelector(".gallery-shell");
      if (state.url) {
        const f = document.createElement("iframe");
        f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-modals");
        f.src = frameSrc(state.url);
        f.style.width = d.w + "px";
        f.style.height = d.h + "px";
        f.style.transform = "scale(" + scale + ")";
        f.style.transformOrigin = "top left";
        shell.appendChild(f);
      } else {
        shell.style.display = "grid";
        shell.style.placeItems = "center";
        shell.innerHTML = '<span style="color:var(--text-3);font-size:12px">No URL loaded</span>';
      }
      el.gallery.appendChild(item);
    });
  }

  // ============================================================
  //  Keyboard shortcuts
  // ============================================================
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "r" || e.key === "R") el.swapBtn.click();
    else if (e.key === "+" || e.key === "=") setZoom(state.zoom + 0.1, true);
    else if (e.key === "-") setZoom(state.zoom - 0.1, true);
    else if (e.key === "0") { state.autoZoom = true; applyViewport(); }
    else if (e.key === "g" || e.key === "G") el.galleryBtn.click();
  });

  // ============================================================
  //  Resize observer — keep auto-zoom fitted
  // ============================================================
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (state.gallery) return;
      if (state.autoZoom) applyViewport();
      else updateRuler();
    }, 80);
  });

  // ============================================================
  //  Init
  // ============================================================
  function init() {
    renderCategoryPills();
    renderDeviceStrip();
    buildRuler();
    syncInputs();
    requestAnimationFrame(() => applyViewport());
    el.urlInput.focus();
  }
  init();
})();
