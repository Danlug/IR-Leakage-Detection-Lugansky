// Alignment math shared by index.html and test/align-core.test.js.
// H (9 numbers, row-major) maps thermal normalised coords (u,v in 0..1) to photo normalised coords (x,y in 0..1).

function applyH(H, u, v) {
  const w = H[6] * u + H[7] * v + H[8];
  return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
}

function invertH(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const r = [e * i - f * h, c * h - b * i, b * f - c * e,
             f * g - d * i, a * i - c * g, c * d - a * f,
             d * h - e * g, b * g - a * h, a * e - b * d];
  const det = a * r[0] + b * r[3] + c * r[6];
  return r.map(x => x / det);
}

// Solve the n×n system A x = b (Gaussian elimination, partial pivoting). Returns null if singular.
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) {
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Least squares via normal equations: rows·x ≈ rhs.
function lsq(rows, rhs) {
  const k = rows[0].length, A = [], b = [];
  for (let i = 0; i < k; i++) {
    A.push(Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
    b.push(rows.reduce((s, r, n) => s + r[i] * rhs[n], 0));
  }
  return solve(A, b);
}

// pairs: [{t:[u,v], p:[x,y]}]; tA/pA = width/height of thermal/photo.
// 2 pairs: shift+scale+rotation, 3: affine, 4+: perspective (least squares).
function fitH(pairs, tA, pA) {
  const n = pairs.length;
  if (n < 2) return null;
  const rows = [], rhs = [];
  if (n === 2) {
    // similarity needs square units: scale u and x by their aspect ratios
    for (const { t: [u, v], p: [x, y] } of pairs) {
      rows.push([u * tA, -v, 1, 0]); rhs.push(x * pA);
      rows.push([v, u * tA, 0, 1]); rhs.push(y);
    }
    const s = lsq(rows, rhs); if (!s) return null;
    const [a, b, c, d] = s;
    return [a * tA / pA, -b / pA, c / pA, b * tA, a, d, 0, 0, 1];
  }
  if (n === 3) {
    for (const { t: [u, v], p: [x, y] } of pairs) {
      rows.push([u, v, 1, 0, 0, 0]); rhs.push(x);
      rows.push([0, 0, 0, u, v, 1]); rhs.push(y);
    }
    const s = lsq(rows, rhs); return s && [...s, 0, 0, 1];
  }
  for (const { t: [u, v], p: [x, y] } of pairs) {
    rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v]); rhs.push(x);
    rows.push([0, 0, 0, u, v, 1, -y * u, -y * v]); rhs.push(y);
  }
  const s = lsq(rows, rhs); return s && [...s, 1];
}

// Thermal width = photo width, centred.
function defaultH(tA, pA) { const k = pA / tA; return [1, 0, 0, 0, k, 0.5 - 0.5 * k, 0, 0, 1]; }

// Leave-one-out error of every pair in photo pixels: how far the fit from the OTHER points misses this one.
function looErrors(pairs, tA, pA, pW, pH) {
  if (pairs.length < 3) return null;
  return pairs.map((q, i) => {
    const H = fitH(pairs.filter((_, j) => j !== i), tA, pA);
    if (!H) return NaN;
    const [x, y] = applyH(H, ...q.t);
    return Math.hypot((x - q.p[0]) * pW, (y - q.p[1]) * pH);
  });
}

// Distance in photo pixels between each photo point and where H puts its thermal point (finds a badly placed pair).
function residuals(H, pairs, pW, pH) {
  return pairs.map(q => { const [x, y] = applyH(H, ...q.t); return Math.hypot((x - q.p[0]) * pW, (y - q.p[1]) * pH); });
}

// Sum over channels of Sobel gradient magnitude. chans: Float32Arrays w*h. NaN at borders and where mask(u,v) is true.
function gradMag(chans, w, h, mask) {
  const g = new Float32Array(w * h).fill(NaN);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (mask && mask((x + 0.5) / w, (y + 0.5) / h)) continue;
    let s = 0;
    for (const c of chans) {
      const i = y * w + x;
      const gx = c[i - w + 1] + 2 * c[i + 1] + c[i + w + 1] - c[i - w - 1] - 2 * c[i - 1] - c[i + w - 1];
      const gy = c[i + w - 1] + 2 * c[i + w] + c[i + w + 1] - c[i - w - 1] - 2 * c[i - w] - c[i - w + 1];
      s += Math.hypot(gx, gy);
    }
    g[y * w + x] = s;
  }
  return g;
}

// Thermal gradients resampled onto the photo grid through H (nearest). NaN where there is no thermal data.
function warpGrad(Gt, tw, th, H, pw, ph) {
  const Hi = invertH(H), out = new Float32Array(pw * ph).fill(NaN);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const [u, v] = applyH(Hi, (x + 0.5) / pw, (y + 0.5) / ph);
    const i = Math.floor(u * tw), j = Math.floor(v * th);
    if (i >= 0 && j >= 0 && i < tw && j < th) out[y * pw + x] = Gt[j * tw + i];
  }
  return out;
}

// Contour match: correlation of photo and thermal edge strength where both exist. 1 = identical edges, ~0 = unrelated.
function edgeScore(Gp, Gt, tw, th, H, pw, ph) {
  const W = warpGrad(Gt, tw, th, H, pw, ph);
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < W.length; i++) {
    const a = Gp[i], b = W[i];
    if (a !== a || b !== b) continue; // NaN
    n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
  }
  if (n < 0.05 * W.length) return -1; // too little overlap to judge
  const cov = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

// Hill-climb the four thermal corners (in photo coords) to maximise edgeScore. Small moves only: start from a good fit.
function refineH(H, score, tA, pA) {
  const T = [[0, 0], [1, 0], [1, 1], [0, 1]];
  let c = T.flatMap(([u, v]) => applyH(H, u, v));
  const toH = c => fitH(T.map((t, i) => ({ t, p: [c[2 * i], c[2 * i + 1]] })), tA, pA);
  let best = score(H), step = 0.008;
  while (step > 0.0005) {
    let improved = false;
    for (let k = 0; k < 8; k++) for (const d of [step, -step]) {
      const c2 = c.slice(); c2[k] += d;
      const H2 = toH(c2), s = H2 ? score(H2) : -1;
      if (s > best + 1e-5) { best = s; c = c2; improved = true; }
    }
    if (!improved) step /= 2;
  }
  return { H: toH(c), score: best };
}

if (typeof module === 'object') module.exports = { applyH, invertH, fitH, defaultH, looErrors, residuals, gradMag, warpGrad, edgeScore, refineH };
