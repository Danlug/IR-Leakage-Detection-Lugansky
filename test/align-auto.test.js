// node test/align-auto.test.js   (needs the personal samples/ and python with Pillow; skips without them)
// Alignment without points on the sample pairs, against positions checked by eye (placeH: height, centre x/y).
const assert = require('assert'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { applyH, placeH, autoAlign } = require('../align-core.js');
const { tempField } = require('../thermal-temp.js');

const dir = path.join(__dirname, '..', 'samples');
if (!fs.existsSync(path.join(dir, 'washer_ir.jpg'))) { console.log('skip: no samples/'); process.exit(0); }

function load(file, w) { // decoded and resized by Pillow (a browser uses a canvas); w = 0 keeps full size
  const py = 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");w=int(sys.argv[2]);' +
    'im=im.resize((w,round(w*im.height/im.width)),Image.LANCZOS) if w else im;sys.stdout.buffer.write(b"%d %d\\n"%im.size+im.tobytes())';
  const out = execFileSync('python', ['-c', py, file, String(w)], { maxBuffer: 1 << 26 });
  const nl = out.indexOf(10), [width, height] = out.subarray(0, nl).toString().split(' ').map(Number);
  return { width, height, data: out.subarray(nl + 1) };
}
const lum = im => ({ w: im.width, h: im.height, v: Float32Array.from({ length: im.width * im.height }, (_, i) => 0.299 * im.data[i * 4] + 0.587 * im.data[i * 4 + 1] + 0.114 * im.data[i * 4 + 2]) });
// mean corner distance in photo heights
const dist = (H, G, pA) => [[0, 0], [1, 0], [1, 1], [0, 1]].reduce((s, [u, v]) => { const a = applyH(H, u, v), b = applyH(G, u, v); return s + Math.hypot((a[0] - b[0]) * pA, a[1] - b[1]) / 4; }, 0);

// expect: the search must land within this distance. washer is a known miss (its edges mislead every score tried).
const CASES = { tv: [[1.0, 0.48, 0.50], 0.07], 'dog-carpet': [[0.9, 0.59, 0.40], 0.07], washer: [[1.2, 0.53, 0.40], null] };
for (const [name, [truth, tol]] of Object.entries(CASES)) {
  const p = load(path.join(dir, name + '_photo.jpg'), 96), t = load(path.join(dir, name + '_ir.jpg'), 0);
  const pA = p.width / p.height, tA = t.width / t.height, t0 = Date.now();
  const r = autoAlign(lum(p), tempField(t, 96), tA, pA), d = dist(r.H, placeH(...truth, 0, tA, pA), pA);
  console.log(name, 'off by', d.toFixed(3), 'photo heights, score', r.score.toFixed(3), `${Date.now() - t0} ms`);
  if (tol) assert(d < tol, `${name}: ${d}`);
}
console.log('align-auto: ok');
