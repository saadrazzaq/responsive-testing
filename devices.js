/* ============================================================
   Device & resolution database
   Widths/heights are CSS (logical) pixels — what your media
   queries actually respond to. dpr = devicePixelRatio.
   ============================================================ */

const BREAKPOINTS = [
  { name: "Mobile",        min: 0,    color: "#f97316" },
  { name: "Large Mobile",  min: 480,  color: "#ec4899" },
  { name: "Tablet",        min: 768,  color: "#8b5cf6" },
  { name: "Laptop",        min: 1024, color: "#3b82f6" },
  { name: "Desktop",       min: 1280, color: "#10b981" },
  { name: "Wide",          min: 1536, color: "#06b6d4" },
];

// Marks shown on the ruler (common CSS breakpoints)
const RULER_MARKS = [320, 480, 640, 768, 1024, 1280, 1440, 1536, 1920];

const DEVICE_CATEGORIES = [
  {
    id: "mobile",
    label: "Mobile",
    icon: "phone",
    devices: [
      { name: "iPhone SE",            w: 375,  h: 667,  dpr: 2 },
      { name: "iPhone 12 / 13 mini",  w: 360,  h: 780,  dpr: 3 },
      { name: "iPhone 14 / 15",       w: 390,  h: 844,  dpr: 3, notch: true },
      { name: "iPhone 15 Pro Max",    w: 430,  h: 932,  dpr: 3, notch: true },
      { name: "Pixel 7",              w: 412,  h: 915,  dpr: 2.625 },
      { name: "Pixel 8 Pro",          w: 448,  h: 998,  dpr: 2.625 },
      { name: "Samsung Galaxy S23",   w: 360,  h: 780,  dpr: 3 },
      { name: "Galaxy S23 Ultra",     w: 384,  h: 824,  dpr: 3.75 },
      { name: "Galaxy Z Flip (open)", w: 344,  h: 882,  dpr: 3 },
    ],
  },
  {
    id: "tablet",
    label: "Tablet",
    icon: "tablet",
    devices: [
      { name: "iPad mini",            w: 744,  h: 1133, dpr: 2 },
      { name: "iPad 10.9\"",          w: 820,  h: 1180, dpr: 2 },
      { name: "iPad Air",             w: 820,  h: 1180, dpr: 2 },
      { name: "iPad Pro 11\"",        w: 834,  h: 1194, dpr: 2 },
      { name: "iPad Pro 12.9\"",      w: 1024, h: 1366, dpr: 2 },
      { name: "Galaxy Tab S9",        w: 800,  h: 1280, dpr: 2.4 },
      { name: "Surface Pro",          w: 912,  h: 1368, dpr: 2 },
    ],
  },
  {
    id: "laptop",
    label: "Laptop",
    icon: "laptop",
    devices: [
      { name: "Laptop 1366",          w: 1366, h: 768,  dpr: 1 },
      { name: "MacBook Air 13\"",     w: 1280, h: 800,  dpr: 2 },
      { name: "MacBook Pro 14\"",     w: 1512, h: 982,  dpr: 2 },
      { name: "MacBook Pro 16\"",     w: 1728, h: 1117, dpr: 2 },
      { name: "Surface Laptop",       w: 1536, h: 1024, dpr: 1.5 },
    ],
  },
  {
    id: "desktop",
    label: "Desktop",
    icon: "desktop",
    devices: [
      { name: "HD 1280",              w: 1280, h: 720,  dpr: 1 },
      { name: "WXGA+ 1440",           w: 1440, h: 900,  dpr: 1 },
      { name: "HD+ 1600",             w: 1600, h: 900,  dpr: 1 },
      { name: "Full HD 1080p",        w: 1920, h: 1080, dpr: 1 },
      { name: "QHD 1440p",            w: 2560, h: 1440, dpr: 1 },
      { name: "4K UHD",               w: 3840, h: 2160, dpr: 1 },
    ],
  },
];

// Flat lookup of all devices
const ALL_DEVICES = DEVICE_CATEGORIES.flatMap((c) =>
  c.devices.map((d) => ({ ...d, category: c.id }))
);

function breakpointFor(width) {
  let match = BREAKPOINTS[0];
  for (const bp of BREAKPOINTS) if (width >= bp.min) match = bp;
  return match;
}

// ============================================================
//  Device emulation profiles
//  Beyond CSS width, real responsiveness depends on the device's
//  User-Agent, device-pixel-ratio, and touch/pointer traits. These
//  templates describe the "identity" the preview should present so
//  UA-sniffing sites, pointer:coarse layouts and DPR logic match the
//  real device instead of always showing the desktop UI.
// ============================================================
const UA_TEMPLATES = {
  ios:        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipados:     "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  android:    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidTab: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

// Build the emulation identity for a device in a given category.
// ua === null  → keep the browser's real (desktop) User-Agent.
function deviceProfile(d, categoryId) {
  const name = (d.name || "").toLowerCase();
  const p = {
    name: d.name, w: d.w, h: d.h, dpr: d.dpr || 1,
    ua: null, platform: null, uaPlatform: null,
    mobile: false, touch: false,
  };

  if (categoryId === "mobile") {
    p.mobile = true; p.touch = true;
    if (name.includes("iphone")) {
      p.ua = UA_TEMPLATES.ios; p.platform = "iPhone"; p.uaPlatform = "iOS";
    } else {
      p.ua = UA_TEMPLATES.android; p.platform = "Linux armv8l"; p.uaPlatform = "Android";
    }
  } else if (categoryId === "tablet") {
    p.touch = true; // tablets are touch, but report as non-mobile (desktop-class)
    if (name.includes("ipad")) {
      p.ua = UA_TEMPLATES.ipados; p.platform = "iPad"; p.uaPlatform = "iOS";
    } else if (name.includes("surface")) {
      // Windows touch device — keep desktop UA, just flag touch.
      p.ua = null; p.uaPlatform = "Windows";
    } else {
      p.ua = UA_TEMPLATES.androidTab; p.platform = "Linux armv8l"; p.uaPlatform = "Android";
    }
  }
  // laptop / desktop → real desktop UA, no touch (defaults above)
  return p;
}
