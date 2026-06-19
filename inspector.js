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
  $("netClearBtn").addEventListener("click", () => { entries.clear(); netList.innerHTML = ""; updateNetEmpty(); });
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
      const rec = { row, url: d.url };
      entries.set(d.id, rec);
      netList.appendChild(row);
      applyNetFilter();
      updateNetEmpty();
      netList.scrollTop = netList.scrollHeight;
    } else if (d.type === "end") {
      const rec = entries.get(d.id);
      if (!rec) return;
      const r = rec.row;
      r.classList.remove("pending");
      r.classList.toggle("err", !d.ok);
      r.querySelector(".c-status").textContent = d.status || "ERR";
      r.querySelector(".c-type").textContent = typeFromCtype(d.ctype, r.querySelector(".c-type").textContent);
      r.querySelector(".c-size").textContent = fmtSize(d.size);
      r.querySelector(".c-time").textContent = fmtMs(d.dur);
    }
  });

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

  function buildCandidates(node, doc) {
    const out = [];
    const seen = {};
    function add(label, value, kind) {
      if (!value || seen[value]) return; seen[value] = 1;
      const count = kind === "css" ? safe(() => doc.querySelectorAll(value).length) : xpCount(doc, value);
      out.push({ label, value, kind, count });
    }
    function safe(f) { try { return f(); } catch (e) { return -1; } }
    const t = tagName(node);
    if (node.id) add("XPath · by id", "//*[@id=" + xpq(node.id) + "]", "xpath");
    ["data-testid", "data-test", "data-cy", "data-qa", "data-automation-id", "name", "aria-label", "title", "placeholder"].forEach((a) => {
      const v = node.getAttribute && node.getAttribute(a);
      if (v) add("XPath · @" + a, "//" + t + "[@" + a + "=" + xpq(v) + "]", "xpath");
    });
    const txt = (node.textContent || "").trim().replace(/\s+/g, " ");
    if (txt && txt.length <= 40 && elementChildren(node).length === 0 && /^(a|button|label|span|li|h[1-6]|td|th|p|strong|em|option)$/i.test(t))
      add("XPath · by text", "//" + t + "[normalize-space()=" + xpq(txt) + "]", "xpath");
    add("XPath · absolute", absXPath(node), "xpath");
    if (node.id) add("CSS · by id", "#" + cssEscape(node.id), "css");
    if (node.classList && node.classList.length) add("CSS · tag.classes", t + "." + Array.prototype.map.call(node.classList, cssEscape).join("."), "css");
    add("CSS · path", cssPath(node, doc), "css");
    return out;
  }

  function renderSelectors(node) {
    const doc = frameDoc();
    selEmpty.style.display = "none";
    selInfo.innerHTML = "";
    selList.innerHTML = "";
    if (!doc) { selEmpty.style.display = ""; selEmpty.innerHTML = noAccessMsg(); return; }

    // element info
    const info = el("div", "sel-el");
    let head = "<b>&lt;" + tagName(node) + "&gt;</b>";
    if (node.id) head += '<span class="pill">#' + esc(node.id) + "</span>";
    if (node.classList) Array.prototype.forEach.call(node.classList, (c) => (head += '<span class="pill cls">.' + esc(c) + "</span>"));
    info.innerHTML = head;
    const txt = (node.textContent || "").trim().replace(/\s+/g, " ");
    if (txt) { const tt = el("div", "sel-text"); tt.textContent = '“' + (txt.length > 80 ? txt.slice(0, 80) + "…" : txt) + '”'; info.appendChild(tt); }
    selInfo.appendChild(info);

    // candidates
    buildCandidates(node, doc).forEach((c) => {
      const item = el("div", "sel-item");
      const badge = c.count === 1 ? '<span class="badge ok">unique</span>' : c.count < 0 ? '<span class="badge warn">invalid</span>' : '<span class="badge warn">' + c.count + " matches</span>";
      item.innerHTML =
        '<div class="sel-row"><span class="sel-label">' + esc(c.label) + "</span>" + badge +
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
