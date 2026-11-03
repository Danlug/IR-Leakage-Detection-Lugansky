// node test/thermal-temp.test.js   (needs the personal samples/ and python with Pillow; skips without them)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createTempReader, readMaxMin } = require('../thermal-temp.js');

const dir = path.join(__dirname, '..', 'samples');
// centre reading, Max, Min from the camera HUD
const KNOWN = { washer: [34.4, 61.9, 22.5], tv: [27.8, 45.3, 25.1], 'dog-carpet': [27.8, 32.5, 23.8], 'dog-lap': [34.1, 34.8, 24.2] };

function load(file) { // shortcut: Node has no JPEG decoder, so Pillow decodes; a browser passes canvas ImageData instead
  const py = 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");' +
    'sys.stdout.buffer.write(b"%d %d\\n"%im.size+im.tobytes())';
  const out = execFileSync('python', ['-c', py, file], { maxBuffer: 1 << 26 });
  const nl = out.indexOf(10), [width, height] = out.subarray(0, nl).toString().split(' ').map(Number);
  return { width, height, data: out.subarray(nl + 1) };
}

if (!fs.existsSync(path.join(dir, 'washer_ir.jpg'))) { console.log('skip: no samples/'); process.exit(0); }

for (const [name, [centre, max, min]] of Object.entries(KNOWN)) {
  const img = load(path.join(dir, name + '_ir.jpg'));
  assert.deepStrictEqual(readMaxMin(img), { max, min }, `${name}: HUD digits`);
  const read = createTempReader(img, { max, min });
  const u = 448 / img.width, v = 598 / img.height, d = 16; // white crosshair covers the centre: read the 4 diagonals
  const ring = [[-d, -d], [d, -d], [-d, d], [d, d]].map(([dx, dy]) => read(u + dx / img.width, v + dy / img.height));
  ring.forEach(r => assert(r.ok, `${name}: diagonal sample rejected`));
  const ts = ring.map(r => r.t);
  console.log(name, 'true', centre, 'diagonals', ts.join(' '));
  // the true centre lies within the diagonal readings ±2 °C (on an edge the diagonals straddle it)
  assert(Math.min(...ts) - 2 <= centre && centre <= Math.max(...ts) + 2, `${name}: ${centre} outside ${ts}`);
  // and on a flat area (all diagonals agree) the reading itself is within 2 °C
  if (Math.max(...ts) - Math.min(...ts) < 1.5) assert(Math.abs(ts[0] - centre) <= 2, `${name}: ${ts[0]} vs ${centre}`);

  // HUD, crosshair and bar are rejected; the reading never leaves max..min
  for (const [a, b] of [[0.1, 0.05], [0.93, 0.5], [0.5, 0.5], [0.5, 0.97]]) assert(!read(a, b).ok, `${name}: HUD ${a},${b} accepted`);
  let okCount = 0, n = 0;
  for (let y = 0.2; y < 0.9; y += 0.02) for (let x = 0.02; x < 0.84; x += 0.02) {
    const r = read(x, y); n++;
    if (r.ok) { okCount++; assert(r.t >= min - 1e-9 && r.t <= max + 1e-9); }
  }
  assert(okCount / n > 0.9, `${name}: only ${okCount}/${n} picture samples accepted`);
}
console.log('thermal-temp ok');
