// node test/report-core.test.js
const assert = require('assert');
const R = require('../report-core.js');

(async () => {
  const key = await R.newKey(), data = new TextEncoder().encode('Масада 5 ✓');
  assert.strictEqual(key.length, 43);
  const enc = await R.encrypt(key, data);
  assert.notDeepStrictEqual(enc.slice(12), data);
  assert.strictEqual(new TextDecoder().decode(await R.decrypt(key, enc)), 'Масада 5 ✓');
  await assert.rejects(R.decrypt(await R.newKey(), enc)); // wrong key
  const tampered = enc.slice(); tampered[20] ^= 1;
  await assert.rejects(R.decrypt(key, tampered));

  const link = R.reportLink('abc123', key);
  assert.deepStrictEqual(R.parseLink(link), { id: 'abc123', key });
  assert.deepStrictEqual(R.parseLink('#abc123.' + key), { id: 'abc123', key });
  assert.strictEqual(R.parseLink('https://x/view.html#abc123.short'), null);
  assert.strictEqual(R.parseLink(''), null);
  console.log('report-core: all ok');
})().catch(e => { console.error(e); process.exit(1); });
