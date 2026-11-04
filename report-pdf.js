// Report -> PDF for view.html. Every page is drawn on a canvas (the browser lays out Hebrew/Cyrillic, so no fonts
// are embedded) and stored as one JPEG per A4 page. Browser part needs viewer.js (createOverlay).

// Minimal PDF 1.4: each JPEG ({bytes, w, h}) fills one A4 page. Returns Uint8Array.
function jpegsToPdf(pages) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, dict, stream) => {
    offs[n] = len; add(`${n} 0 obj\n${dict}\n`);
    if (stream) { add('stream\n'); add(stream); add('\nendstream\n'); }
    add('endobj\n');
  };
  const W = 595.28, H = 841.89, count = 3 + pages.length * 3;
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  pages.forEach((p, i) => {
    const o = 3 + i * 3, content = enc.encode(`q ${W} 0 0 ${H} 0 0 cm /Im Do Q`);
    obj(o, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im ${o + 1} 0 R >> >> /Contents ${o + 2} 0 R >>`);
    obj(o + 1, `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>`, p.bytes);
    obj(o + 2, `<< /Length ${content.length} >>`, content);
  });
  const xref = len;
  add(`xref\n0 ${count}\n0000000000 65535 f \n` + offs.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join(''));
  add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let at = 0;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
}

// Like dir="auto": right-to-left when the first strong letter is Hebrew/Arabic; null when there is none.
function textRtl(s) {
  const m = /[A-Za-zÀ-ɏͰ-ӿ֐-ࣿ]/.exec(s || '');
  return m ? /[֐-ࣿ]/.test(m[0]) : null;
}

// Greedy word wrap with the context's current font; keeps the user's line breaks.
function wrapLines(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? line + ' ' + w : w;
      if (line && ctx.measureText(tryLine).width > maxW) { lines.push(line); line = w; } else line = tryLine;
    }
    lines.push(line);
  }
  return lines;
}

// opts: { title, date, heading, disclaimer, rtl, labels: {photo, overlay}, pairs: [{label, photo, thermal, H, comment, temps}] }
async function buildReportPdf(opts, onProgress) {
  const PW = 1240, PH = 1754, M = 90, CW = PW - 2 * M, FONT = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
  const pages = [];
  const page = () => {
    const c = document.createElement('canvas'); c.width = PW; c.height = PH;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH); ctx.textBaseline = 'top';
    return [c, ctx];
  };
  // Draws lines aligned to the document side; each line's own direction follows its text.
  const text = (ctx, lines, y, size, { weight = 400, color = '#1d1d1f', lh = 1.45 } = {}) => {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = opts.rtl ? 'right' : 'left';
    for (const l of lines) {
      const r = textRtl(l); ctx.direction = (r === null ? opts.rtl : r) ? 'rtl' : 'ltr';
      ctx.fillText(l, opts.rtl ? PW - M : M, y); y += size * lh;
    }
    return y;
  };
  const wrap = (ctx, s, size, weight = 400) => { ctx.font = `${weight} ${size}px ${FONT}`; return wrapLines(ctx, s, CW); };
  const finish = async c => {
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.8));
    pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height });
  };

  // Page 1: title, date, disclaimer.
  let [c, ctx] = page(), y = M;
  y = text(ctx, wrap(ctx, opts.title, 52, 700), y, 52, { weight: 700, lh: 1.25 });
  y = text(ctx, [opts.date], y + 10, 28, { color: '#6e6e73' });
  ctx.fillStyle = '#e8541c'; ctx.fillRect(M, y + 30, CW, 4); y += 70;
  y = text(ctx, [opts.heading], y, 34, { weight: 700 });
  text(ctx, wrap(ctx, opts.disclaimer, 28), y + 12, 28);
  await finish(c);

  // One page per pair: photo and the thermal overlaid on it (opacity 0.6), side by side or stacked, whichever is bigger.
  const ovc = document.createElement('canvas'), ov = createOverlay(ovc);
  for (const [i, p] of opts.pairs.entries()) {
    if (onProgress) onProgress(i + 1, opts.pairs.length);
    [c, ctx] = page(); y = M;
    y = text(ctx, [p.label], y, 40, { weight: 700 });
    if (p.temps) y = text(ctx, [p.temps], y + 4, 28, { color: '#6e6e73' });
    y += 24;
    const CAP = 30, GAP = 24, maxComment = 12;
    let comment = p.comment ? wrap(ctx, p.comment, 28) : [];
    if (comment.length > maxComment) comment = [...comment.slice(0, maxComment - 1), comment[maxComment - 1] + ' …']; // shortcut: very long comments are cut, paginate if clients write essays
    const availH = PH - M - y - (comment.length ? comment.length * 28 * 1.45 + 30 : 0) - 2 * CAP;
    ov.setImages(p.photo, p.thermal, p.H);
    const w = p.photo.naturalWidth, h = p.photo.naturalHeight;
    const side = Math.min((CW - GAP) / 2 / w, availH / h), stack = Math.min(CW / w, (availH - GAP - CAP) / 2 / h);
    const s = Math.max(side, stack), dw = w * s, dh = h * s;
    const boxes = side >= stack
      ? [[M + (CW - 2 * dw - GAP) / 2, y], [M + (CW - 2 * dw - GAP) / 2 + dw + GAP, y]]
      : [[M + (CW - dw) / 2, y], [M + (CW - dw) / 2, y + dh + CAP + GAP]];
    if (opts.rtl && side >= stack) boxes.reverse(); // photo first in reading order
    const shots = [[p.photo, opts.labels.photo], [p.thermal ? ovc : p.photo, opts.labels.overlay]];
    shots.forEach(([im, cap], k) => {
      const [x, yy] = boxes[k]; ctx.drawImage(im, x, yy, dw, dh);
      ctx.font = `400 22px ${FONT}`; ctx.fillStyle = '#6e6e73'; ctx.textAlign = 'center';
      const r = textRtl(cap); ctx.direction = (r === null ? opts.rtl : r) ? 'rtl' : 'ltr';
      ctx.fillText(cap, x + dw / 2, yy + dh + 6);
    });
    y = boxes[1][1] + dh + CAP + 30;
    text(ctx, comment, y, 28);
    await finish(c);
  }
  return new Blob([jpegsToPdf(pages)], { type: 'application/pdf' });
}

if (typeof module === 'object') module.exports = { jpegsToPdf, textRtl, wrapLines };
