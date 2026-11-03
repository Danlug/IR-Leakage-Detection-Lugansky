// Photo + warped thermal on one canvas, in "opacity" or "swipe" mode. Shared by index.html (author) and view.html (client).
// Needs align-core.js (applyH, invertH).
function createOverlay(cv, { afterDraw } = {}) {
  const ctx = cv.getContext('2d');
  const wc = document.createElement('canvas'), wctx = wc.getContext('2d');
  const MAX_SIDE = 1600; // display cap so phones keep up
  const o = { V: null, T: null, H: null, tData: null, mode: 'opacity', opacity: 0.6, swipe: 0.5, onSwipe: null };

  o.setImages = (V, T, H) => {
    o.V = V; o.T = T; o.H = H;
    if (V) {
      const k = Math.min(1, MAX_SIDE / Math.max(V.naturalWidth, V.naturalHeight));
      cv.width = wc.width = Math.round(V.naturalWidth * k); cv.height = wc.height = Math.round(V.naturalHeight * k);
    }
    o.tData = null;
    if (T) {
      const c = document.createElement('canvas'); c.width = T.naturalWidth; c.height = T.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(T, 0, 0); o.tData = x.getImageData(0, 0, c.width, c.height);
    }
    o.warp(); o.draw();
  };
  o.setH = H => { o.H = H; o.warp(); o.draw(); };

  // Inverse-map every display pixel into the thermal image (bilinear).
  o.warp = () => {
    if (!o.V || !o.tData || !o.H) return;
    const W = wc.width, Hh = wc.height, out = wctx.createImageData(W, Hh), d = out.data;
    const s = o.tData.data, tw = o.tData.width, th = o.tData.height, [a, b, c, e, f, g, h, k, l] = invertH(o.H);
    for (let y = 0; y < Hh; y++) {
      const Y = (y + 0.5) / Hh;
      for (let x = 0; x < W; x++) {
        const X = (x + 0.5) / W, w = h * X + k * Y + l;
        const u = (a * X + b * Y + c) / w * tw - 0.5, v = (e * X + f * Y + g) / w * th - 0.5;
        if (!(u >= 0 && v >= 0 && u < tw - 1 && v < th - 1)) continue;
        const i0 = u | 0, j0 = v | 0, fu = u - i0, fv = v - j0, p = (j0 * tw + i0) * 4, q = (y * W + x) * 4, r = tw * 4;
        for (let ch = 0; ch < 3; ch++)
          d[q + ch] = (s[p + ch] * (1 - fu) + s[p + 4 + ch] * fu) * (1 - fv) + (s[p + r + ch] * (1 - fu) + s[p + r + 4 + ch] * fu) * fv;
        d[q + 3] = 255;
      }
    }
    wctx.putImageData(out, 0, 0);
  };

  o.draw = () => {
    const W = cv.width, Hh = cv.height;
    ctx.clearRect(0, 0, W, Hh);
    if (o.V) ctx.drawImage(o.V, 0, 0, W, Hh);
    if (o.V && o.tData && o.H) {
      ctx.save();
      if (o.mode === 'swipe') { ctx.beginPath(); ctx.rect(0, 0, o.swipe * W, Hh); ctx.clip(); }
      ctx.globalAlpha = o.mode === 'opacity' ? o.opacity : 1;
      ctx.drawImage(wc, 0, 0);
      ctx.restore();
      if (o.mode === 'swipe') {
        const x = o.swipe * W; ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, 0, 4, Hh);
        ctx.beginPath(); ctx.arc(x, Hh / 2, W * 0.025, 0, 7); ctx.fill();
      }
    }
    if (afterDraw) afterDraw(ctx, W, Hh);
  };

  // Drag anywhere on the picture to move the swipe divider.
  const move = e => {
    if (o.mode !== 'swipe' || !cv.hasPointerCapture(e.pointerId)) return;
    const b = cv.getBoundingClientRect(); o.swipe = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)); o.draw();
    if (o.onSwipe) o.onSwipe(o.swipe);
  };
  cv.addEventListener('pointerdown', e => { if (o.mode === 'swipe') { cv.setPointerCapture(e.pointerId); move(e); } });
  cv.addEventListener('pointermove', move);
  return o;
}
