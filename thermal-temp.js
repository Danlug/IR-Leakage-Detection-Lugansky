// Approximate temperature from the colours of a thermal-camera screenshot (896x1195 layout of the samples).
// createTempReader(imageData, {max, min}) -> (u, v) => ({ t, ok }), u,v in 0..1 of the whole screenshot.
// Method: nearest colour on the screenshot's own colour bar -> bar position p (0 = top/hot, 1 = bottom/cold),
// then linear p -> °C. The picture only uses the bar between P_HOT and P_COLD (measured on all four samples:
// hottest pixels sit at p≈0.04, coldest at p≈0.80; the bar's navy-black bottom never appears), so that span
// maps to max..min, not the whole bar. Expect about ±2 °C on flat areas, worse on edges (see test).

const P_HOT = 0.04, P_COLD = 0.80;
// HUD boxes as fractions of the screenshot: [u0, v0, u1, v1].
const HUD = [
  [0, 0, 0.30, 0.185],        // big reading + Max/Min
  [0.826, 0, 1, 0.084],       // battery
  [0.848, 0.117, 1, 0.904],   // colour bar with its labels
  [0, 0.929, 1, 1],           // date / time
];
const BAR = { u0: 0.911, u1: 0.949, v0: 0.1766, v1: 0.8318 };

// Compare colours mostly by hue/saturation: the picture's blues are brighter than the bar's.
function feat(r, g, b) {
  const m = Math.sqrt(r * r + g * g + b * b) + 1;
  return [r / m * 255, g / m * 255, b / m * 255, m / Math.sqrt(3) * 0.3];
}

function createTempReader(img, { max, min }) {
  const { width: W, height: H, data } = img;
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const bar = [];
  const x0 = Math.round(BAR.u0 * W), x1 = Math.round(BAR.u1 * W);
  const y0 = Math.round(BAR.v0 * H), y1 = Math.round(BAR.v1 * H);
  for (let y = y0; y <= y1; y++) {
    const cols = [[], [], []];
    for (let x = x0; x < x1; x++) px(x, y).forEach((c, k) => cols[k].push(c));
    bar.push(feat(...cols.map(c => c.sort((a, b) => a - b)[c.length >> 1]))); // per-channel median of the row
  }
  const cache = new Map();
  function pos(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    let hit = cache.get(key);
    if (!hit) {
      const f = feat(r, g, b);
      let best = 0, bd = Infinity;
      bar.forEach((q, i) => {
        const d = (q[0] - f[0]) ** 2 + (q[1] - f[1]) ** 2 + (q[2] - f[2]) ** 2 + (q[3] - f[3]) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      cache.set(key, hit = [best / (bar.length - 1), Math.sqrt(bd)]);
    }
    return hit;
  }
  return (u, v) => {
    const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
    const [p, dist] = pos(...px(x, y));
    const f = (p - P_HOT) / (P_COLD - P_HOT);
    const t = max - (max - min) * Math.min(1, Math.max(0, f));
    // white text/crosshair lands at the bar's white top, black outlines at its bottom: both are outside the span.
    const cx = (x - W / 2) * 896 / W, cy = (y - H / 2) * 896 / W; // crosshair: Ø≈22 px disc + arms to ±32 px
    const cross = cx * cx + cy * cy < 13 * 13 || (Math.abs(cx) < 5 && Math.abs(cy) < 34) || (Math.abs(cy) < 5 && Math.abs(cx) < 34);
    const ok = !cross && !HUD.some(([a, b, c, d]) => u >= a && u <= c && v >= b && v <= d)
      && dist < 60 && f > -0.04 && f < 1.06;
    return { t: Math.round(t * 10) / 10, ok };
  };
}

// --- Max / Min from the HUD digits (same font and place on every screenshot of this camera) ---
const GW = 10, GH = 16;
// Digit bitmaps (GW*GH bits as hex, digits 0..9) cut from the sample HUDs by glyphs(): Max/Min lines and bar labels;
// 0 only from the date line and 7 only from the big centre reading (no sample has them in Max/Min).
const DIGITS = Object.fromEntries((
  '1e0ee7198240f03c0f01c0703c0d036098633878 0c0707c0300c0300c0300c0300c0300c0300e3ff 3e1fe43806008060180e030180c060381c0e03ff 1f1de41802008060383c0780600c0300c07c39fc 0301c07024090441108461104c33ff0300401004 7f9804010040100601fe0180300c0300c06839f8 0f8773018060100c03fee0f03c0701405833187c fffff00c06018060300c060180c03018060380c0 1e0ce6198340982318781f08640f03c0f03618fc 1e0ce6190240f014058373c7100c0200806031f8'
).split(' ').map((h, d) => [d, [...h].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('')]));

// White glyphs inside a pixel rect, split on empty columns, each scaled to a GW x GH bitmap.
function glyphs(img, x0, x1, y0, y1) {
  const { width: W, data } = img;
  const white = (x, y) => { const i = (y * W + x) * 4; return Math.min(data[i], data[i + 1], data[i + 2]) > 170; };
  const colHas = x => { for (let y = y0; y < y1; y++) if (white(x, y)) return true; return false; };
  const out = [];
  for (let x = x0; x < x1; x++) {
    if (!colHas(x)) continue;
    let e = x; while (e < x1 && colHas(e)) e++;
    let t = y1, b = y0;
    for (let y = y0; y < y1; y++) for (let k = x; k < e; k++) if (white(k, y)) { t = Math.min(t, y); b = Math.max(b, y + 1); }
    let bits = '';
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      const ya = t + Math.floor(r * (b - t) / GH), yb = t + Math.max(Math.floor(r * (b - t) / GH) + 1, Math.floor((r + 1) * (b - t) / GH));
      const xa = x + Math.floor(c * (e - x) / GW), xb = x + Math.max(Math.floor(c * (e - x) / GW) + 1, Math.floor((c + 1) * (e - x) / GW));
      let n = 0, m = 0;
      for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) { n++; m += white(xx, yy); }
      bits += m * 2 > n ? '1' : '0';
    }
    out.push({ w: e - x, h: b - t, bits });
    x = e;
  }
  return out;
}

// Number like "61.9" / "-3.2" in a pixel rect, or null when any glyph is not a confident match.
function readNumber(img, rect) {
  const gs = glyphs(img, ...rect), lineH = Math.max(0, ...gs.map(g => g.h));
  let s = '';
  for (const g of gs) {
    if (g.h < 0.45 * lineH) { s += g.w > 1.6 * g.h ? '-' : '.'; continue; } // shortcut: '-' never seen in samples, guessed by shape
    let best = null, bd = Infinity;
    for (const [d, t] of Object.entries(DIGITS)) {
      let n = 0; for (let i = 0; i < t.length; i++) n += t[i] !== g.bits[i];
      if (n < bd) { bd = n; best = d; }
    }
    if (bd > 30) return null;
    s += best;
  }
  return /^-?\d{1,3}\.\d$/.test(s) ? Number(s) : null;
}

// {max, min} read twice (HUD lines and bar labels); null unless both readings agree.
function readMaxMin(img) {
  const k = img.width / 896, R = (a, b, c, d) => [a, b, c, d].map(z => Math.round(z * k));
  if (Math.abs(img.height / k - 1195) > 3) return null; // other layout
  const max = readNumber(img, R(127, 290, 105, 150)), min = readNumber(img, R(117, 290, 162, 207));
  const top = readNumber(img, R(745, 892, 150, 196)), bot = readNumber(img, R(745, 892, 1018, 1064));
  return max !== null && max === top && min !== null && min === bot && max > min ? { max, min } : null;
}

if (typeof module === 'object') module.exports = { createTempReader, readMaxMin, glyphs };
