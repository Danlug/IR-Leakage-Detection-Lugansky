// node test/report-pdf.test.js
const assert = require('assert');
const { jpegsToPdf, textRtl, wrapLines } = require('../report-pdf.js');

const pdf = Buffer.from(jpegsToPdf([{ bytes: new Uint8Array([0xff, 0xd8, 1, 2, 0xff, 0xd9]), w: 2, h: 3 }, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w: 4, h: 5 }]));
const s = pdf.toString('latin1');
assert(s.startsWith('%PDF-1.4') && s.endsWith('%%EOF\n'));
assert(/\/Count 2 /.test(s));
// every xref offset points at its "n 0 obj", and startxref points at the table
const xref = +/startxref\n(\d+)/.exec(s)[1];
assert.strictEqual(s.slice(xref, xref + 4), 'xref');
const offs = s.slice(xref).match(/^\d{10} 00000 n $/gm).map(l => +l.slice(0, 10));
assert.strictEqual(offs.length, 8);
offs.forEach((o, i) => assert(s.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1}`));

assert.strictEqual(textRtl('שלום 12'), true);
assert.strictEqual(textRtl('12 Привет שלום'), false);
assert.strictEqual(textRtl('Max 21.5 °C'), false);
assert.strictEqual(textRtl('123 '), null);

const ctx = { measureText: t => ({ width: t.length }) };
assert.deepStrictEqual(wrapLines(ctx, 'aa bb cc\ndd', 5), ['aa bb', 'cc', 'dd']);
console.log('report-pdf: all ok');
