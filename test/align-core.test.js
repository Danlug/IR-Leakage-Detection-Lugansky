// node test/align-core.test.js
const assert = require('assert');
const A = require('../align-core.js');

const tA = 90 / 120, pA = 160 / 120;
const Htrue = [0.9, 0.05, 0.04, -0.03, 1.1 * pA / tA * 0.8, 0.08, 0.05, -0.04, 1];
const near = (a, b, eps = 1e-9) => assert(Math.abs(a - b) < eps, `${a} vs ${b}`);
const pair = (u, v, H = Htrue) => ({ t: [u, v], p: A.applyH(H, u, v) });

// inverse round trip
const [x, y] = A.applyH(Htrue, 0.3, 0.7), [u, v] = A.applyH(A.invertH(Htrue), x, y);
near(u, 0.3); near(v, 0.7);

// 4 exact pairs recover the perspective map everywhere
const H4 = A.fitH([pair(0.1, 0.1), pair(0.9, 0.15), pair(0.85, 0.9), pair(0.2, 0.8)], tA, pA);
for (const [a, b] of [[0.5, 0.5], [0, 1], [0.33, 0.66]]) {
  const p = A.applyH(H4, a, b), q = A.applyH(Htrue, a, b); near(p[0], q[0], 1e-7); near(p[1], q[1], 1e-7);
}

// 2 pairs: similarity passes through both points
const two = [pair(0.2, 0.3), pair(0.7, 0.6)], H2 = A.fitH(two, tA, pA);
for (const q of two) { const p = A.applyH(H2, ...q.t); near(p[0], q.p[0], 1e-9); near(p[1], q.p[1], 1e-9); }

// leave-one-out: exact points ~0, a misplaced point stands out
const six = [pair(0.1, 0.1), pair(0.9, 0.1), pair(0.9, 0.9), pair(0.1, 0.9), pair(0.5, 0.4), pair(0.3, 0.6)];
assert(Math.max(...A.looErrors(six, tA, pA, 160, 120)) < 1e-6);
six[4] = { t: six[4].t, p: [six[4].p[0] + 0.05, six[4].p[1]] };
const res = A.residuals(A.fitH(six, tA, pA), six, 160, 120);
assert(res.indexOf(Math.max(...res)) === 4, String(res));
assert(Math.max(...A.looErrors(six, tA, pA, 160, 120)) > 5);

// synthetic scene: photo and a thermal rendering of the same scene through Htrue
const scene = (x, y) => ((x > 0.3 && x < 0.6 && y > 0.2 && y < 0.5) ? 1 : 0) + ((x - 0.7) ** 2 + (y - 0.7) ** 2 < 0.02 ? 0.7 : 0)
  + ((x > 0.15 && x < 0.25 && y > 0.6) ? 0.5 : 0);
const pw = 160, ph = 120, tw = 90, th = 120;
const photo = new Float32Array(pw * ph), therm = new Float32Array(tw * th);
for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) photo[j * pw + i] = scene((i + 0.5) / pw, (j + 0.5) / ph);
for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) therm[j * tw + i] = scene(...A.applyH(Htrue, (i + 0.5) / tw, (j + 0.5) / th));
const Gp = A.gradMag([photo], pw, ph), Gt = A.gradMag([therm], tw, th);
const score = H => A.edgeScore(Gp, Gt, tw, th, H, pw, ph);

const good = score(Htrue);
const Hoff = A.fitH([[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b], k) => {
  const p = A.applyH(Htrue, a, b); return { t: [a, b], p: [p[0] + (k % 2 ? 0.02 : -0.015), p[1] + 0.015] };
}), tA, pA);
const bad = score(Hoff);
assert(good > 0.8 && bad < good - 0.2, `good ${good} bad ${bad}`);

// auto refinement moves an off map back
const r = A.refineH(Hoff, score, tA, pA);
const cornerErr = H => Math.max(...[[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => {
  const p = A.applyH(H, a, b), q = A.applyH(Htrue, a, b); return Math.hypot((p[0] - q[0]) * pw, (p[1] - q[1]) * ph);
}));
assert(r.score > bad && cornerErr(r.H) < cornerErr(Hoff) / 2, `score ${bad}->${r.score}, corners ${cornerErr(Hoff)}->${cornerErr(r.H)}`);

// HUD mask removes gradients
assert(Number.isNaN(A.gradMag([therm], tw, th, (u, v) => v < 0.5)[10 * tw + 40]));
console.log('align-core: all ok', { good: good.toFixed(3), bad: bad.toFixed(3), refined: r.score.toFixed(3), cornersPx: [cornerErr(Hoff).toFixed(1), cornerErr(r.H).toFixed(1)] });
