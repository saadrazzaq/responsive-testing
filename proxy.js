/* ============================================================
   QALens — local same-origin reverse proxy
   ------------------------------------------------------------
   Two problems stop sites loading in an <iframe>:

   1. Framing blocks  — X-Frame-Options / CSP frame-ancestors
      headers tell the browser "never embed me".
   2. Cross-origin data — single-page apps fetch their content
      from their own API *after* load. If the HTML is on
      localhost but the API is on the real site, the browser
      blocks those calls as cross-origin, so you get an empty
      skeleton (this is what happens with YouTube, dashboards…).

   This proxy fixes BOTH by routing EVERYTHING through
   localhost: the page, its scripts, its API calls. The app
   believes it's talking to itself, so data loads and framing
   headers are stripped on the way out.

   How it works:
     • /__rqa/go?url=<target>  sets a cookie remembering the
       target origin, then redirects the iframe to the same
       path on localhost.
     • Every following request (/, /api/x, /script.js …) is
       proxied to  <target origin> + <path>  using that cookie.
     • HTML/CSS/JS bodies have the target origin rewritten to
       root-relative so even hard-coded absolute URLs come back
       through the proxy.

   Zero dependencies — Node built-ins only.
   Run:  node proxy.js   (or double-click start.cmd)
   ============================================================ */
"use strict";

const http  = require("http");
const https = require("https");
const zlib  = require("zlib");
const fs    = require("fs");
const path  = require("path");
const { spawn } = require("child_process");
const { URL } = require("url");

const PORT = process.env.PORT || 8090;
const MAX_REDIRECTS = 6;
const TIMEOUT_MS = 25000;
const COOKIE = "__rqa_target";

// Response headers that block framing / embedding — never forward these.
const STRIP_RES = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "service-worker-allowed",
  "clear-site-data",
]);

// Content types whose body we rewrite (text). Everything else streams as-is.
const TEXT_RE = /\b(text\/html|text\/css|application\/javascript|text\/javascript|application\/json|application\/xml|text\/xml|image\/svg)\b/i;

// ---------- helpers ----------
function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

function decompress(buf, enc) {
  try {
    if (enc === "gzip") return zlib.gunzipSync(buf);
    if (enc === "deflate") return zlib.inflateSync(buf);
    if (enc === "br") return zlib.brotliDecompressSync(buf);
  } catch (e) { /* fall through, return raw */ }
  return buf;
}

// Rewrite absolute references to the target origin into root-relative
// ones so they route back through the proxy (keeps everything same-origin).
function rewriteBody(text, origin, host) {
  return text
    .split(origin).join("")        // https://host/x  -> /x
    .split("//" + host).join("");  // //host/x        -> /x
}

function errorPage(message, target) {
  return (
    '<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:system-ui,sans-serif;' +
    "display:flex;align-items:center;justify-content:center;height:100vh;background:#f7f8fc;color:#1d2233;text-align:center\">" +
    '<div style="max-width:400px;padding:24px"><div style="font-size:40px">⚠️</div>' +
    '<h2 style="margin:12px 0 6px;font-size:17px">Couldn\'t load this page</h2>' +
    '<p style="color:#5b6178;font-size:13px;line-height:1.5">' + String(message).replace(/</g, "&lt;") + "</p>" +
    (target ? '<p style="color:#9197ad;font-size:12px;word-break:break-all">' + String(target).replace(/</g, "&lt;") + "</p>" : "") +
    "</div></body>"
  );
}

// ---------- core proxy of a single request ----------
function proxyRequest(clientReq, clientRes, targetUrl, bodyBuf, redirects, cookieOrigin) {
  let u;
  try { u = new URL(targetUrl); } catch (e) { return sendError(clientRes, "Invalid URL: " + targetUrl); }
  if (u.protocol !== "http:" && u.protocol !== "https:") return sendError(clientRes, "Only http/https is supported");

  const lib = u.protocol === "https:" ? https : http;

  // Build upstream headers from the client's, fixing host & cookies.
  const headers = {};
  for (const [k, v] of Object.entries(clientReq.headers)) {
    const key = k.toLowerCase();
    if (["host", "origin", "referer", "accept-encoding", "connection", "content-length"].includes(key)) continue;
    headers[k] = v;
  }
  headers["host"] = u.host;
  headers["accept-encoding"] = "gzip, deflate, br";
  // Strip our own bookkeeping cookie before forwarding the rest to the site.
  if (clientReq.headers.cookie) {
    const kept = clientReq.headers.cookie
      .split(";").map((s) => s.trim()).filter((s) => s && !s.startsWith(COOKIE + "="));
    if (kept.length) headers["cookie"] = kept.join("; "); else delete headers["cookie"];
  }
  if (bodyBuf && bodyBuf.length) headers["content-length"] = bodyBuf.length;

  const upReq = lib.request(
    u,
    { method: clientReq.method, headers },
    (upRes) => {
      // Resolve ALL redirects server-side (same- AND cross-origin) so the
      // browser never sees a redirect chain — this prevents browser-level
      // "too many redirects" loops. If we cross to a new origin, we remember
      // it (cookieOrigin) and refresh the browser's cookie on the final reply.
      if ([301, 302, 303, 307, 308].includes(upRes.statusCode) && upRes.headers.location && redirects < MAX_REDIRECTS) {
        const next = new URL(upRes.headers.location, u);
        upRes.resume();
        // 301/302/303 -> follow as GET (drop body); 307/308 -> keep method+body.
        const keepBody = upRes.statusCode === 307 || upRes.statusCode === 308;
        const nextReq = keepBody ? clientReq : Object.assign(Object.create(clientReq), { method: "GET" });
        return proxyRequest(nextReq, clientRes, next.href, keepBody ? bodyBuf : null, redirects + 1, cookieOrigin);
      }

      const ct = upRes.headers["content-type"] || "";
      const isText = TEXT_RE.test(ct);

      // Build response headers (drop framing/length/encoding; rewrite cookies).
      const outHeaders = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        const key = k.toLowerCase();
        if (STRIP_RES.has(key)) continue;
        if (key === "set-cookie") {
          const arr = Array.isArray(v) ? v : [v];
          outHeaders["set-cookie"] = arr.map(rewriteSetCookie);
          continue;
        }
        if (key === "location") { outHeaders[k] = String(v).split(u.origin).join(""); continue; }
        outHeaders[k] = v;
      }
      outHeaders["Access-Control-Allow-Origin"] = "*";

      // If server-side redirects landed us on a different origin, update the
      // browser's bookkeeping cookie so later root-relative requests target it.
      if (cookieOrigin && u.origin !== cookieOrigin) {
        const sc = outHeaders["set-cookie"] ? (Array.isArray(outHeaders["set-cookie"]) ? outHeaders["set-cookie"] : [outHeaders["set-cookie"]]) : [];
        sc.push(COOKIE + "=" + encodeURIComponent(u.origin) + "; Path=/; SameSite=Lax");
        outHeaders["set-cookie"] = sc;
      }

      if (isText) {
        // Buffer, decompress, rewrite, send.
        const chunks = [];
        upRes.on("data", (c) => chunks.push(c));
        upRes.on("end", () => {
          let buf = decompress(Buffer.concat(chunks), (upRes.headers["content-encoding"] || "").toLowerCase());
          let text = rewriteBody(buf.toString("utf8"), u.origin, u.host);
          // For HTML, neutralize service workers so a proxied PWA (YouTube,
          // etc.) can't install one on localhost and hijack navigations into
          // a redirect loop.
          if (/text\/html/i.test(ct)) text = injectClientScripts(text);
          clientRes.writeHead(upRes.statusCode, outHeaders);
          clientRes.end(text);
        });
        upRes.on("error", () => { try { clientRes.end(); } catch (e) {} });
      } else {
        // Binary / media: stream straight through (no buffering of big files).
        if (upRes.headers["content-encoding"]) outHeaders["content-encoding"] = upRes.headers["content-encoding"];
        clientRes.writeHead(upRes.statusCode, outHeaders);
        upRes.pipe(clientRes);
      }
    }
  );

  upReq.on("error", (e) => sendError(clientRes, e.message, targetUrl));
  upReq.setTimeout(TIMEOUT_MS, () => upReq.destroy(new Error("Request timed out")));
  if (bodyBuf && bodyBuf.length) upReq.write(bodyBuf);
  upReq.end();
}

// Script injected at the very top of proxied HTML: disable service-worker
// registration and remove any already-installed ones for this origin.
const SW_KILLER =
  "<script>(function(){try{if(navigator.serviceWorker){" +
  "navigator.serviceWorker.register=function(){return Promise.reject(new Error('sw disabled by QALens'))};" +
  "if(navigator.serviceWorker.getRegistrations){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()})}).catch(function(){})}" +
  "}}catch(e){}})();</script>";

// Network monitor injected into proxied pages. Self-gates on a localStorage
// flag (shared with the tool because both are on localhost:8090) so it only
// records when the tester turns "Record" on. Streams entries to the parent.
const NET_MONITOR = "<script>(" + (function () {
  if (window.__rqaNet) return; window.__rqaNet = 1;
  var s = 0, LIM = 80000;
  function on() { try { return localStorage.getItem("rqa-net-on") === "1"; } catch (e) { return false; } }
  function post(m) { try { m.source = "rqa-net"; parent.postMessage(m, "*"); } catch (e) {} }
  function hdrs(h) { var o = {}; try { if (h && h.forEach) h.forEach(function (v, k) { o[k] = v; }); } catch (e) {} return o; }
  function reqHdrs(init, input) {
    var o = {}; try {
      var h = (init && init.headers) || (input && input.headers);
      if (h) { if (h.forEach) h.forEach(function (v, k) { o[k] = v; }); else if (h.length) for (var i = 0; i < h.length; i++) o[h[i][0]] = h[i][1]; else for (var k in h) o[k] = h[k]; }
    } catch (e) {} return o;
  }
  function parseAll(str) { var o = {}; (str || "").trim().split(/\r?\n/).forEach(function (l) { var i = l.indexOf(":"); if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); return o; }
  var of = window.fetch;
  if (of) window.fetch = function (i, n) {
    if (!on()) return of.apply(this, arguments);
    var id = ++s, t = performance.now();
    var u = typeof i === "string" ? i : (i && i.url) || "";
    var m = (n && n.method) || (i && i.method) || "GET";
    var rb = n && typeof n.body === "string" ? n.body.slice(0, LIM) : null;
    var rh = reqHdrs(n, i);
    post({ type: "start", id: id, method: m, url: u, kind: "fetch" });
    return of.apply(this, arguments).then(function (r) {
      var L = r.headers && r.headers.get && r.headers.get("content-length");
      var ct = (r.headers && r.headers.get && r.headers.get("content-type")) || "";
      var base = { type: "end", id: id, status: r.status, statusText: r.statusText, ok: r.ok, dur: performance.now() - t, size: L ? +L : null, ctype: ct, reqHeaders: rh, reqBody: rb, resHeaders: hdrs(r.headers) };
      if (/json|text|xml|javascript|html/i.test(ct)) {
        try { r.clone().text().then(function (tx) { base.body = tx.slice(0, LIM); post(base); }, function () { post(base); }); return r; } catch (e) {}
      }
      post(base); return r;
    }, function (e) { post({ type: "end", id: id, status: 0, ok: false, dur: performance.now() - t, error: String(e), reqHeaders: rh, reqBody: rb }); throw e; });
  };
  var X = window.XMLHttpRequest;
  if (X) {
    var op = X.prototype.open, sn = X.prototype.send, sh = X.prototype.setRequestHeader;
    X.prototype.open = function (m, u) { this.__r = { m: m, u: u, h: {} }; return op.apply(this, arguments); };
    X.prototype.setRequestHeader = function (k, v) { if (this.__r) this.__r.h[k] = v; return sh.apply(this, arguments); };
    X.prototype.send = function (b) {
      var x = this;
      if (on() && x.__r) {
        var id = ++s, t = performance.now();
        post({ type: "start", id: id, method: x.__r.m, url: x.__r.u, kind: "xhr" });
        x.addEventListener("loadend", function () {
          var ct = (x.getResponseHeader && x.getResponseHeader("content-type")) || "";
          var body = null; try { body = (x.responseText || "").slice(0, LIM); } catch (e) {}
          post({ type: "end", id: id, status: x.status, statusText: x.statusText, ok: x.status >= 200 && x.status < 400, dur: performance.now() - t, size: (x.responseText || "").length || null, ctype: ct, reqHeaders: x.__r.h, reqBody: typeof b === "string" ? b.slice(0, LIM) : null, resHeaders: parseAll(x.getAllResponseHeaders && x.getAllResponseHeaders()), body: body });
        });
      }
      return sn.apply(this, arguments);
    };
  }
}).toString() + ")();</script>";

function injectClientScripts(html) {
  const inject = SW_KILLER + NET_MONITOR;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + inject);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + inject);
  return inject + html;
}

// Make Set-Cookie usable on http://localhost (drop Domain/Secure/SameSite=None).
function rewriteSetCookie(c) {
  return String(c)
    .replace(/;\s*Domain=[^;]+/gi, "")
    .replace(/;\s*Secure/gi, "")
    .replace(/;\s*SameSite=None/gi, "; SameSite=Lax");
}

function sendError(res, message, target) {
  if (res.headersSent) { try { res.end(); } catch (e) {} return; }
  res.writeHead(502, { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" });
  res.end(errorPage(message, target));
}

// ---------- static serving of the tool's own UI ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

function serveStatic(res, pathname) {
  // /__app/  -> index.html ;  /__app/app.js -> app.js
  let rel = pathname.slice("/__app".length);
  if (rel === "" || rel === "/") rel = "/index.html";
  rel = rel.replace(/\\/g, "/");
  if (rel.includes("..")) { res.writeHead(403); return res.end("Forbidden"); }
  const filePath = path.join(__dirname, rel);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

// ---------- server ----------
const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, "http://localhost");
  const pathname = reqUrl.pathname;
  if (process.env.RQA_DEBUG) {
    const hasCookie = /(^|;\s*)__rqa_target=/.test(req.headers.cookie || "");
    console.log("[" + req.method + "] " + req.url.slice(0, 80) + "  cookie=" + (hasCookie ? "Y" : "n") + "  sfs=" + (req.headers["sec-fetch-site"] || "-") + "/" + (req.headers["sec-fetch-dest"] || "-"));
  }

  // The tool UI is served from this origin so it shares cookies with the
  // proxied iframe (otherwise the browser blocks the proxy's cookie as 3rd-party).
  if (pathname === "/__app") { res.writeHead(302, { Location: "/__app/" }); return res.end(); }
  if (pathname.startsWith("/__app/")) return serveStatic(res, pathname);

  // Landing on the bare origin with no site loaded -> send them to the tool.
  if (pathname === "/" && !parseCookies(req.headers.cookie)[COOKIE]) {
    res.writeHead(302, { Location: "/__app/" });
    return res.end();
  }

  // Health check used by the tool's Proxy toggle.
  if (pathname === "/__rqa/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end('{"ok":true,"service":"qalens-proxy","mode":"reverse"}');
  }

  // Entry point: remember the target origin, then redirect into it.
  if (pathname === "/__rqa/go") {
    const target = reqUrl.searchParams.get("url");
    let t;
    try { t = new URL(target); } catch (e) { return sendError(res, "Invalid URL: " + target); }
    const cookieVal = encodeURIComponent(t.origin);
    const dest = t.pathname + t.search + t.hash;
    res.writeHead(302, {
      "Set-Cookie": COOKIE + "=" + cookieVal + "; Path=/; SameSite=Lax",
      Location: dest || "/",
    });
    return res.end();
  }

  // Any other path -> proxy it to <remembered origin> + path.
  const cookies = parseCookies(req.headers.cookie);
  const origin = cookies[COOKIE] ? decodeURIComponent(cookies[COOKIE]) : null;
  if (!origin) {
    res.writeHead(400, { "Content-Type": "text/html" });
    return res.end(errorPage("No target site is loaded. Load a URL through the tool first (Proxy: On)."));
  }
  const targetUrl = origin + req.url;

  // Collect a request body for POST/PUT/PATCH, then proxy.
  if (req.method === "GET" || req.method === "HEAD") {
    proxyRequest(req, res, targetUrl, null, 0, origin);
  } else {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => proxyRequest(req, res, targetUrl, Buffer.concat(chunks), 0, origin));
    req.on("error", () => sendError(res, "Error reading request body"));
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("\n  A QALens proxy is already running on port " + PORT + ".");
    console.log("  You don't need to start another one — just use the tool.");
    console.log("  (To use a different port: set PORT, e.g.  set PORT=8091 && node proxy.js)\n");
  } else {
    console.log("\n  Proxy failed to start: " + err.message + "\n");
  }
  process.exit(0);
});

// Cross-platform "open this URL in the default browser" (Windows/macOS/Linux).
function openBrowser(url) {
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch (e) { /* opening is best-effort */ }
}

server.listen(PORT, () => {
  const url = "http://localhost:" + PORT + "/__app/";
  console.log("\n  QALens reverse proxy running");
  console.log("  Open the tool:  " + url);
  console.log("  Routes the page AND its data calls through localhost so SPAs load.");
  console.log("  Keep this window open while testing. Press Ctrl+C to stop.");
  console.log("  Engineered by Muhammad Saad Razzaq\n");
  if (process.argv.includes("--open")) openBrowser(url);
});
