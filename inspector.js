/* ============================================================
   ResponsiveQA — Inspector
   Network monitor · Elements tree · XPath / CSS selector generator
   Works when the previewed page is same-origin (Proxy: On), so the
   tool can read the iframe DOM and receive its network events.
   ============================================================ */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const previewFrame = $("previewFrame");
  const devpanel = $("devpanel");
  const inspectBtn = $("inspectBtn");

  // ---- helpers ----
  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function frameDoc() { try { const d = previewFrame.contentDocument; if (d && d.body) return d; } catch (e) {} return null; }
  function elementChildren(node) { return Array.prototype.filter.call(node.childNodes || [], (n) => n.nodeType === 1); }
  function fmtSize(n) { if (n == null) return "—"; if (n < 1024) return n + " B"; if (n < 1048576) return (n / 1024).toFixed(1) + " KB"; return (n / 1048576).toFixed(2) + " MB"; }
  function fmtMs(n) { if (n == null) return "—"; return n < 1000 ? Math.round(n) + " ms" : (n / 1000).toFixed(2) + " s"; }

  // ============================================================
  //  Panel open/close + tabs
  // ============================================================
  function togglePanel(force) {
    const open = force != null ? force : devpanel.hasAttribute("hidden");
    if (open) devpanel.removeAttribute("hidden"); else devpanel.setAttribute("hidden", "");
    inspectBtn.classList.toggle("active", open);
    window.dispatchEvent(new Event("resize")); // let the stage refit its zoom
    if (open && !domTree.children.length) refreshTree();
  }
  inspectBtn.addEventListener("click", () => togglePanel());
  $("dpClose").addEventListener("click", () => togglePanel(false));

  // drag the left edge to resize the panel
  (function () {
    const handle = $("dpResize");
    let dragging = false;
    try { const w = localStorage.getItem("rqa-dp-w"); if (w) devpanel.style.width = w + "px"; } catch (e) {}
    handle.addEventListener("mousedown", (e) => {
      dragging = true; e.preventDefault();
      document.body.style.cursor = "ew-resize"; document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const w = Math.min(Math.max(window.innerWidth - e.clientX, 320), Math.min(1000, window.innerWidth - 360));
      devpanel.style.width = w + "px";
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = ""; document.body.style.userSelect = "";
      try { localStorage.setItem("rqa-dp-w", parseInt(devpanel.style.width, 10)); } catch (e) {}
      window.dispatchEvent(new Event("resize"));
    });
  })();

  document.querySelectorAll(".dp-tab").forEach((t) => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });
  function switchTab(name) {
    document.querySelectorAll(".dp-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".dp-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
  }

  // ============================================================
  //  NETWORK monitor
  // ============================================================
  const netList = $("netList"), netEmpty = $("netEmpty"), netCount = $("netCount"), netFilter = $("netFilter");
  const netRecBtn = $("netRecBtn"), netRecLabel = $("netRecLabel");
  const entries = new Map();
  let recording = false;

  try { recording = localStorage.getItem("rqa-net-on") === "1"; } catch (e) {}

  function setRecording(on) {
    recording = on;
    try { localStorage.setItem("rqa-net-on", on ? "1" : "0"); } catch (e) {}
    netRecBtn.classList.toggle("on", on);
    netRecLabel.textContent = "Record: " + (on ? "On" : "Off");
  }
  setRecording(recording);
  netRecBtn.addEventListener("click", () => setRecording(!recording));
  $("netClearBtn").addEventListener("click", () => { entries.clear(); netList.innerHTML = ""; closeDetail(); updateNetEmpty(); });
  netFilter.addEventListener("input", applyNetFilter);

  function updateNetEmpty() {
    netCount.textContent = entries.size;
    netEmpty.style.display = entries.size ? "none" : "";
  }
  function shortUrl(u) {
    try { const x = new URL(u, location.href); return (x.pathname + x.search) || x.href; } catch (e) { return u; }
  }
  function typeFromCtype(ct, kind) {
    if (!ct) return kind || "—";
    ct = ct.toLowerCase();
    if (ct.includes("json")) return "json";
    if (ct.includes("javascript")) return "js";
    if (ct.includes("html")) return "doc";
    if (ct.includes("css")) return "css";
    if (ct.includes("image")) return "img";
    return ct.split(";")[0].split("/").pop();
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "rqa-net") return;
    if (d.type === "start") {
      const row = el("div", "net-row pending");
      row.innerHTML =
        '<span class="c-name" title="' + esc(d.url) + '">' + esc(shortUrl(d.url)) + "</span>" +
        '<span class="c-method">' + esc(d.method || "") + "</span>" +
        '<span class="c-status">···</span><span class="c-type">' + esc(d.kind) + "</span>" +
        '<span class="c-size">—</span><span class="c-time">—</span>';
      const rec = { row, url: d.url, data: { url: d.url, method: d.method, kind: d.kind } };
      entries.set(d.id, rec);
      row.addEventListener("click", () => openDetail(d.id));
      netList.appendChild(row);
      applyNetFilter();
      updateNetEmpty();
      netList.scrollTop = netList.scrollHeight;
    } else if (d.type === "end") {
      const rec = entries.get(d.id);
      if (!rec) return;
      Object.assign(rec.data, d);
      const r = rec.row;
      r.classList.remove("pending");
      r.classList.toggle("err", !d.ok);
      r.querySelector(".c-status").textContent = d.status || "ERR";
      r.querySelector(".c-type").textContent = typeFromCtype(d.ctype, r.querySelector(".c-type").textContent);
      r.querySelector(".c-size").textContent = fmtSize(d.size);
      r.querySelector(".c-time").textContent = fmtMs(d.dur);
      if (detailId === d.id) renderDetail(); // live-update open detail
    }
  });

  // ---- request detail drawer ----
  const netDetail = $("netDetail"), ndBody = $("ndBody");
  let detailId = null, ndTab = "general";
  document.querySelectorAll(".nd-tab").forEach((t) =>
    t.addEventListener("click", () => { ndTab = t.dataset.ndtab; document.querySelectorAll(".nd-tab").forEach((x) => x.classList.toggle("active", x === t)); renderDetail(); })
  );
  $("ndClose").addEventListener("click", closeDetail);
  function closeDetail() {
    netDetail.setAttribute("hidden", "");
    if (detailId != null) { const rec = entries.get(detailId); if (rec) rec.row.classList.remove("active"); }
    detailId = null;
  }
  function openDetail(id) {
    if (detailId != null) { const p = entries.get(detailId); if (p) p.row.classList.remove("active"); }
    detailId = id;
    const rec = entries.get(id);
    if (rec) rec.row.classList.add("active");
    netDetail.removeAttribute("hidden");
    renderDetail();
  }
  function kv(k, v, cls) { return '<div class="nd-kv"><span class="k">' + esc(k) + '</span><span class="v ' + (cls || "") + '">' + esc(v) + "</span></div>"; }
  function headerBlock(title, obj) {
    const keys = obj ? Object.keys(obj) : [];
    let h = '<div class="nd-section-title">' + esc(title) + "</div>";
    if (!keys.length) return h + '<div class="nd-empty">— none —</div>';
    h += keys.map((k) => kv(k, obj[k])).join("");
    return h;
  }
  function prettyBody(body, ctype) {
    if (body == null || body === "") return '<div class="nd-empty">— empty —</div>';
    let text = body;
    if (/json/i.test(ctype || "")) { try { text = JSON.stringify(JSON.parse(body), null, 2); } catch (e) {} }
    return '<button class="nd-copy">Copy</button><div class="nd-pre">' + esc(text) + "</div>";
  }
  function wireCopy(container, raw) {
    const b = container.querySelector(".nd-copy");
    if (b) b.addEventListener("click", () => { copy(raw); const o = b.textContent; b.textContent = "Copied!"; b.classList.add("done"); setTimeout(() => { b.textContent = o; b.classList.remove("done"); }, 1100); });
  }
  function renderDetail() {
    const rec = detailId != null ? entries.get(detailId) : null;
    if (!rec) { ndBody.innerHTML = '<div class="nd-empty">Select a request.</div>'; return; }
    const d = rec.data;
    if (ndTab === "general") {
      const badge = d.status == null ? "" : '<span class="nd-badge ' + (d.ok ? "ok" : "err") + '">' + (d.status || "ERR") + " " + esc(d.statusText || "") + "</span>";
      ndBody.innerHTML =
        kv("Request URL", d.url, "full-url") +
        kv("Method", d.method || "") +
        '<div class="nd-kv"><span class="k">Status</span><span class="v">' + (badge || "pending") + "</span></div>" +
        kv("Type", typeFromCtype(d.ctype, d.kind)) +
        kv("Content-Type", d.ctype || "—") +
        kv("Size", fmtSize(d.size)) +
        kv("Time", fmtMs(d.dur)) +
        (d.error ? kv("Error", d.error) : "");
    } else if (ndTab === "request") {
      ndBody.innerHTML = headerBlock("Request Headers", d.reqHeaders) +
        '<div class="nd-section-title">Request Payload</div>' + prettyBody(d.reqBody, "");
      wireCopy(ndBody, d.reqBody || "");
    } else if (ndTab === "response") {
      ndBody.innerHTML = headerBlock("Response Headers", d.resHeaders) +
        '<div class="nd-section-title">Response Body</div>' + prettyBody(d.body, d.ctype);
      wireCopy(ndBody, d.body || "");
    }
  }

  function applyNetFilter() {
    const q = netFilter.value.trim().toLowerCase();
    entries.forEach((rec) => {
      rec.row.style.display = !q || rec.url.toLowerCase().includes(q) ? "" : "none";
    });
  }

  // ============================================================
  //  ELEMENTS tree + picker
  // ============================================================
  const domTree = $("domTree"), domEmpty = $("domEmpty");
  let selected = null;
  let picking = false;

  $("inspRefreshBtn").addEventListener("click", refreshTree);
  const pickBtn = $("inspPickBtn"), pickLabel = $("inspPickLabel");
  pickBtn.addEventListener("click", () => setPicking(!picking));

  function noAccessMsg() {
    return frameDoc() ? null : "Can't read the page DOM. Load a site with <b>Proxy: On</b> (the inspector needs same-origin access).";
  }

  function refreshTree() {
    const d = frameDoc();
    domTree.innerHTML = "";
    const warn = noAccessMsg();
    domEmpty.innerHTML = warn || "Empty.";
    if (!d) { domEmpty.style.display = ""; return; }
    domEmpty.style.display = "none";
    const root = d.body || d.documentElement;
    renderNode(root, domTree, 0, true);
  }

  function formatTag(node, plain) {
    let s = node.nodeName.toLowerCase();
    if (node.id) s += "#" + node.id;
    if (node.classList && node.classList.length) s += "." + Array.prototype.join.call(node.classList, ".");
    if (s.length > 50) s = s.slice(0, 50) + "…";
    return s;
  }

  function renderNode(node, container, depth, expand) {
    const kids = elementChildren(node);
    const row = el("div", "dt-row");
    row.style.paddingLeft = 6 + depth * 12 + "px";
    const tw = el("span", "dt-tw", kids.length ? "▸" : "");
    const lbl = el("span", "dt-tag", formatTag(node));
    row.appendChild(tw); row.appendChild(lbl);
    container.appendChild(row);

    const wrap = el("div", "dt-kids");
    wrap.style.display = "none";
    container.appendChild(wrap);

    let open = false;
    function toggle() {
      if (!kids.length) return;
      open = !open;
      tw.textContent = open ? "▾" : "▸";
      wrap.style.display = open ? "" : "none";
      if (open && !wrap.dataset.built) {
        kids.forEach((c) => renderNode(c, wrap, depth + 1));
        wrap.dataset.built = "1";
      }
    }
    tw.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    row.addEventListener("click", (e) => { e.stopPropagation(); selectElement(node, false); markRow(row); });
    row.addEventListener("mouseenter", () => highlight(node));
    node.__rqaRow = row;
    if (expand) toggle();
    return { toggle };
  }

  let lastRow = null;
  function markRow(row) { if (lastRow) lastRow.classList.remove("sel"); row.classList.add("sel"); lastRow = row; }

  function setPicking(on) {
    picking = on;
    pickBtn.classList.toggle("on", on);
    pickLabel.textContent = "Pick element: " + (on ? "On" : "Off");
    const d = frameDoc();
    if (on && !d) { setPicking(false); alert(noAccessMsg().replace(/<\/?b>/g, "")); return; }
    attachPicker(on);
    if (on) togglePanel(true);
  }

  function attachPicker(on) {
    const d = frameDoc();
    if (!d) return;
    if (on) {
      d.addEventListener("mousemove", onPickMove, true);
      d.addEventListener("click", onPickClick, true);
      d.addEventListener("keydown", onPickKey, true);
    } else {
      d.removeEventListener("mousemove", onPickMove, true);
      d.removeEventListener("click", onPickClick, true);
      d.removeEventListener("keydown", onPickKey, true);
      clearHighlight();
    }
  }
  function onPickMove(e) { highlight(e.target); }
  function onPickClick(e) { e.preventDefault(); e.stopPropagation(); selectElement(e.target, true); setPicking(false); }
  function onPickKey(e) { if (e.key === "Escape") setPicking(false); }

  // highlight overlay lives inside the iframe document (scales with zoom)
  function highlight(node) {
    const d = frameDoc(); if (!d || !node || node.nodeType !== 1) return;
    let box = d.getElementById("__rqa_hl"), lab = d.getElementById("__rqa_hl_l");
    if (!box) {
      box = d.createElement("div"); box.id = "__rqa_hl";
      box.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;background:rgba(109,74,255,.18);border:1px solid #6d4aff;box-sizing:border-box;";
      d.body.appendChild(box);
      lab = d.createElement("div"); lab.id = "__rqa_hl_l";
      lab.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;background:#6d4aff;color:#fff;font:600 11px/1.4 monospace;padding:2px 6px;border-radius:4px;white-space:nowrap;";
      d.body.appendChild(lab);
    }
    const r = node.getBoundingClientRect();
    box.style.cssText += "";
    box.style.left = r.left + "px"; box.style.top = r.top + "px"; box.style.width = r.width + "px"; box.style.height = r.height + "px"; box.style.display = "block";
    lab.textContent = formatTag(node) + "  " + Math.round(r.width) + "×" + Math.round(r.height);
    lab.style.left = r.left + "px"; lab.style.top = Math.max(0, r.top - 20) + "px"; lab.style.display = "block";
  }
  function clearHighlight() {
    const d = frameDoc(); if (!d) return;
    ["__rqa_hl", "__rqa_hl_l"].forEach((id) => { const e = d.getElementById(id); if (e) e.style.display = "none"; });
  }

  // ============================================================
  //  SELECTORS (XPath + CSS)
  // ============================================================
  const selInfo = $("selInfo"), selList = $("selList"), selEmpty = $("selEmpty");

  function selectElement(node, gotoSelectors) {
    if (!node || node.nodeType !== 1) return;
    selected = node;
    highlight(node);
    renderSelectors(node);
    if (gotoSelectors) { togglePanel(true); switchTab("selectors"); }
  }

  function cssEscape(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
  function xpq(s) {
    s = String(s);
    if (s.indexOf("'") < 0) return "'" + s + "'";
    if (s.indexOf('"') < 0) return '"' + s + '"';
    return "concat('" + s.split("'").join("',\"'\",'") + "')";
  }
  function tagName(n) { return n.nodeName.toLowerCase(); }

  function absXPath(node) {
    const parts = [];
    for (let e = node; e && e.nodeType === 1; e = e.parentNode) {
      let i = 1;
      for (let s = e.previousSibling; s; s = s.previousSibling) if (s.nodeType === 1 && s.nodeName === e.nodeName) i++;
      parts.unshift(tagName(e) + "[" + i + "]");
    }
    return "/" + parts.join("/");
  }
  function cssPath(node, doc) {
    if (node.id && doc.querySelectorAll("#" + cssEscape(node.id)).length === 1) return "#" + cssEscape(node.id);
    const parts = [];
    let e = node;
    while (e && e.nodeType === 1 && e !== doc.documentElement) {
      if (e.id) { parts.unshift("#" + cssEscape(e.id)); break; }
      let sel = tagName(e), i = 1;
      for (let s = e; (s = s.previousElementSibling); ) if (s.nodeName === e.nodeName) i++;
      sel += ":nth-of-type(" + i + ")";
      parts.unshift(sel);
      e = e.parentNode;
    }
    return parts.join(" > ");
  }
  function xpCount(doc, xp) { try { return doc.evaluate(xp, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength; } catch (e) { return -1; } }
  function xpIndexOf(doc, xp, node) {
    try { const r = doc.evaluate(xp, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null); for (let i = 0; i < r.snapshotLength; i++) if (r.snapshotItem(i) === node) return i + 1; } catch (e) {}
    return -1;
  }
  function ownText(node) { let t = ""; Array.prototype.forEach.call(node.childNodes || [], (n) => { if (n.nodeType === 3) t += n.nodeValue; }); return t.replace(/\s+/g, " ").trim(); }
  function allText(node) { return (node.textContent || "").replace(/\s+/g, " ").trim(); }
  function attrVal(node, a) { const v = node.getAttribute && node.getAttribute(a); return v != null && v !== "" && v.length <= 80 ? v : null; }

  // attributes worth using in a locator, strongest first
  const STABLE_ATTRS = ["id", "data-testid", "data-test", "data-cy", "data-qa", "data-automation-id", "data-id", "name", "aria-label", "placeholder", "title", "type", "role", "alt", "for", "href", "value"];
  const GENERIC_CLASS = /^(active|clearfix|row|col(-\w+)?|container|wrapper|flex|grid|hidden|show|open|left|right|center|btn|button|item|list|d-\w+|mt-\d|mb-\d|px-\d|py-\d)$/i;

  function nearestAnchor(node) {
    for (let e = node.parentNode; e && e.nodeType === 1 && e.nodeName !== "HTML"; e = e.parentNode) {
      if (e.id) return { attr: "id", val: e.id };
      for (const a of ["data-testid", "data-test", "data-cy", "data-qa", "data-automation-id"]) {
        const v = e.getAttribute && e.getAttribute(a);
        if (v) return { attr: a, val: v };
      }
    }
    return null;
  }

  function scoreCandidate(c) {
    let s = 0;
    if (c.count === 1) s += 120; else if (c.count > 1) s += Math.max(0, 14 - c.count); else s -= 60;
    s += Math.max(0, 70 - c.value.length / 2);
    if (/@id=/.test(c.value)) s += 45;
    if (/@(data-testid|data-test|data-cy|data-qa|data-automation-id|data-id)=/.test(c.value)) s += 50;
    if (/@name=/.test(c.value)) s += 32;
    if (/@(placeholder|aria-label|title|for|alt)=/.test(c.value)) s += 20;
    if (/text\(\)|normalize-space/.test(c.value)) s += 22;
    if (/contains\(@class/.test(c.value)) s += 14;
    if (/ and /.test(c.value)) s += 8;
    s -= ((c.value.match(/\[\d+\]/g) || []).length) * 9;
    if (/^\/html/.test(c.value)) s -= 50;
    if (c.kind === "css") s -= 8;
    return s;
  }

  function buildCandidates(node, doc) {
    const out = [];
    const seen = {};
    function add(label, value, kind) {
      if (!value || seen[value]) return; seen[value] = 1;
      let count;
      if (kind === "css") { try { count = doc.querySelectorAll(value).length; } catch (e) { count = -1; } }
      else count = xpCount(doc, value);
      out.push({ label, value, kind, count });
    }
    const t = tagName(node);

    // 1) id
    if (node.id) add("Rel XPath · id", "//" + t + "[@id=" + xpq(node.id) + "]", "xpath");

    // 2) each stable attribute on its own
    const present = [];
    STABLE_ATTRS.forEach((a) => {
      if (a === "id") return;
      const v = attrVal(node, a);
      if (v) { present.push([a, v]); add("Rel XPath · @" + a, "//" + t + "[@" + a + "=" + xpq(v) + "]", "xpath"); }
    });

    // 3) text
    const ot = ownText(node), at = allText(node);
    if (ot && ot.length <= 60) {
      add("Rel XPath · text", "//" + t + "[text()=" + xpq(ot) + "]", "xpath");
      add("Rel XPath · contains text", "//" + t + "[contains(text()," + xpq(ot.length > 25 ? ot.slice(0, 25) : ot) + ")]", "xpath");
    }
    if (at && at !== ot && at.length <= 60) add("Rel XPath · normalize-space", "//" + t + "[normalize-space()=" + xpq(at) + "]", "xpath");

    // 4) class
    if (node.classList && node.classList.length) {
      add("Rel XPath · class", "//" + t + "[@class=" + xpq(node.getAttribute("class")) + "]", "xpath");
      const cls = Array.prototype.slice.call(node.classList);
      const distinct = cls.filter((c) => !GENERIC_CLASS.test(c));
      (distinct.length ? distinct : cls).slice(0, 2).forEach((c) =>
        add("Rel XPath · contains class", "//" + t + "[contains(@class," + xpq(c) + ")]", "xpath"));
    }

    // 5) combinations
    if (present.length >= 2)
      add("Rel XPath · 2 attrs", "//" + t + "[@" + present[0][0] + "=" + xpq(present[0][1]) + " and @" + present[1][0] + "=" + xpq(present[1][1]) + "]", "xpath");
    if (present.length >= 1 && ot && ot.length <= 40)
      add("Rel XPath · attr + text", "//" + t + "[@" + present[0][0] + "=" + xpq(present[0][1]) + " and text()=" + xpq(ot) + "]", "xpath");

    // 6) relative to nearest anchored ancestor
    const anc = nearestAnchor(node);
    if (anc) {
      let local = t;
      if (present[0]) local = t + "[@" + present[0][0] + "=" + xpq(present[0][1]) + "]";
      else if (node.classList && node.classList.length) local = t + "[contains(@class," + xpq((Array.prototype.slice.call(node.classList).filter((c) => !GENERIC_CLASS.test(c))[0]) || node.classList[0]) + ")]";
      else if (ot && ot.length <= 40) local = t + "[normalize-space()=" + xpq(ot) + "]";
      add("Rel XPath · under @" + anc.attr, "//*[@" + anc.attr + "=" + xpq(anc.val) + "]//" + local, "xpath");
    }

    // 7) absolute fallback
    add("Abs XPath", absXPath(node), "xpath");

    // CSS (secondary)
    if (node.id) add("CSS · id", "#" + cssEscape(node.id), "css");
    if (node.classList && node.classList.length) add("CSS · tag.classes", t + "." + Array.prototype.map.call(node.classList, cssEscape).join("."), "css");
    add("CSS · path", cssPath(node, doc), "css");

    out.forEach((c) => (c.score = scoreCandidate(c)));

    // indexed variant to guarantee a working unique locator from the best near-miss
    const near = out.filter((c) => c.kind === "xpath" && c.count > 1 && !/^\/html/.test(c.value)).sort((a, b) => b.score - a.score)[0];
    if (near) {
      const idx = xpIndexOf(doc, near.value, node);
      if (idx > 0) { const v = "(" + near.value + ")[" + idx + "]"; if (!seen[v]) { const c = { label: near.label + " · indexed", value: v, kind: "xpath", count: xpCount(doc, v) }; c.score = scoreCandidate(c) + 6; out.push(c); } }
    }

    out.sort((a, b) => b.score - a.score);
    return out;
  }

  function renderSelectors(node) {
    const doc = frameDoc();
    selEmpty.style.display = "none";
    selInfo.innerHTML = "";
    selList.innerHTML = "";
    if (!doc) { selEmpty.style.display = ""; selEmpty.innerHTML = noAccessMsg(); return; }

    const info = el("div", "sel-el");
    let head = "<b>&lt;" + tagName(node) + "&gt;</b>";
    if (node.id) head += '<span class="pill">#' + esc(node.id) + "</span>";
    if (node.classList) Array.prototype.forEach.call(node.classList, (c) => (head += '<span class="pill cls">.' + esc(c) + "</span>"));
    info.innerHTML = head;
    const txt = allText(node);
    if (txt) { const tt = el("div", "sel-text"); tt.textContent = '“' + (txt.length > 80 ? txt.slice(0, 80) + "…" : txt) + '”'; info.appendChild(tt); }
    selInfo.appendChild(info);

    const cands = buildCandidates(node, doc);
    const recommended = cands.find((c) => c.kind === "xpath" && c.count === 1) || cands[0];

    cands.forEach((c) => {
      const item = el("div", "sel-item" + (c === recommended ? " recommended" : ""));
      const badge = c.count === 1 ? '<span class="badge ok">unique</span>' : c.count < 0 ? '<span class="badge warn">invalid</span>' : '<span class="badge warn">' + c.count + " matches</span>";
      const star = c === recommended ? '<span class="rec-star">★ Recommended</span>' : "";
      item.innerHTML =
        '<div class="sel-row"><span class="sel-label">' + esc(c.label) + "</span>" + star + badge +
        '<button class="sel-copy" title="Copy">Copy</button></div>' +
        '<code class="sel-val"></code>';
      item.querySelector(".sel-val").textContent = c.value;
      item.querySelector(".sel-copy").addEventListener("click", (e) => {
        copy(c.value); const b = e.target; const o = b.textContent; b.textContent = "Copied!"; b.classList.add("done"); setTimeout(() => { b.textContent = o; b.classList.remove("done"); }, 1100);
      });
      selList.appendChild(item);
    });
  }

  function copy(s) {
    try { navigator.clipboard.writeText(s); }
    catch (e) { const t = el("textarea"); t.value = s; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ============================================================
  //  React to frame reloads
  // ============================================================
  previewFrame.addEventListener("load", () => {
    selected = null; lastRow = null;
    selInfo.innerHTML = ""; selList.innerHTML = "";
    selEmpty.style.display = ""; selEmpty.innerHTML = selEmpty.dataset.def || selEmpty.innerHTML;
    domTree.innerHTML = "";
    if (!devpanel.hasAttribute("hidden")) refreshTree();
    if (picking) setTimeout(() => attachPicker(true), 60);
  });
  selEmpty.dataset.def = selEmpty.innerHTML;
})();
