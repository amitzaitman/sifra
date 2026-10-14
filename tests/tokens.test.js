// The role colours of design.md section 3, measured from app.css (design 10 [unit]): contrast by
// WCAG, and CIEDE2000 distances in normal vision and in the three colour-blind simulations of
// Machado, Oliveira & Fernandes 2009 at full severity, applied to linear RGB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
/** @type {(name: string) => string} a colour token's hex value in app.css */
const token = (name) => {
  const found = css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(found, `${name} in app.css`);
  return found[1];
};

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};
const luminance = (hex) => rgbOf(hex).map(toLinear).reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
/** @type {(a: string, b: string) => number} */
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const VISIONS = ['normal', ...Object.keys(MACHADO)];
/** @type {(hex: string, vision: string) => number[]} sRGB as seen */
const seen = (hex, vision) => {
  if (vision === 'normal') return rgbOf(hex);
  const lin = rgbOf(hex).map(toLinear);
  return MACHADO[vision].map((row) => toGamma(row.reduce((n, m, j) => n + m * lin[j], 0)));
};
/** @type {(rgb: number[]) => number[]} CIELAB, D65 */
const lab = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  const xyz = [(0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, 0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883];
  const [fx, fy, fz] = xyz.map((t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const rad = (d) => (d * Math.PI) / 180;
/** @type {(p: number[], q: number[]) => number} CIEDE2000 */
function de00([L1, a1, b1], [L2, a2, b2]) {
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const [p1, p2] = [(1 + G) * a1, (1 + G) * a2];
  const [C1, C2] = [Math.hypot(p1, b1), Math.hypot(p2, b2)];
  const hue = (b, a) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const [h1, h2] = [hue(b1, p1), hue(b2, p2)];
  const dh = C1 * C2 === 0 ? 0 : Math.abs(h2 - h1) <= 180 ? h2 - h1 : h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 + 360;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2));
  const [Lm, Cm] = [(L1 + L2) / 2, (C1 + C2) / 2];
  const hm = C1 * C2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const [SC, SH] = [1 + 0.045 * Cm, 1 + 0.015 * Cm * T];
  const RT = -Math.sin(rad(60 * Math.exp(-(((hm - 275) / 25) ** 2)))) * 2 * Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7));
  const [l, c, h] = [(L2 - L1) / SL, (C2 - C1) / SC, dH / SH];
  return Math.sqrt(l * l + c * c + h * h + RT * c * h);
}
/** @type {(a: string, b: string, vision: string) => number} */
const distance = (a, b, vision) => de00(lab(seen(a, vision)), lab(seen(b, vision)));
/** @type {(a: string, b: string) => number} the smallest distance over the four visions */
const nearest = (a, b) => Math.min(...VISIONS.map((v) => distance(token(a), token(b), v)));

const ROLES = ['--role-whole', '--role-part', '--role-unknown', '--role-added'];

test('design 3: the four role fills stay 18 apart (CIEDE2000) in normal vision and in the three simulations', () => {
  for (const [i, a] of ROLES.entries()) {
    for (const b of ROLES.slice(i + 1)) assert.ok(nearest(a, b) >= 18, `${a} ${b}: ${nearest(a, b).toFixed(1)}`);
  }
  // The method gives the numbers design 3 states: the nearest pair is whole and unknown in protanopia, 18.7.
  assert.equal(distance(token('--role-whole'), token('--role-unknown'), 'protan').toFixed(1), '18.7');
});

test('design 3: the part\'s light shade (--role-part-2) is apart from the part yellow, carried by the part edge, and far from every other role', () => {
  const [light, edge] = [token('--role-part-2'), token('--role-part-edge')];
  // Two known parts side by side read as two colours, also colour-blind: 15 at least.
  assert.ok(nearest('--role-part-2', '--role-part') >= 15, `from the part yellow: ${nearest('--role-part-2', '--role-part').toFixed(1)}`);
  for (const other of ['--role-whole', '--role-unknown', '--role-added', '--role-added-ghost']) {
    assert.ok(nearest('--role-part-2', other) >= 18, `from ${other}: ${nearest('--role-part-2', other).toFixed(1)}`);
  }
  // The fill is pale on the paper and the panel, so the edge carries it (3:1 for graphics).
  assert.ok(contrast(light, token('--paper')) < 1.5);
  for (const back of [token('--paper'), token('--panel'), token('--surface'), light]) assert.ok(contrast(edge, back) >= 3, `edge on ${back}: ${contrast(edge, back).toFixed(2)}`);
  // A touch mark (--ink) on it, and a tour digit (--role-unknown on a --surface disc).
  assert.ok(contrast(token('--ink'), light) >= 4.5);
  assert.ok(contrast(token('--role-unknown'), token('--surface')) >= 4.5);
});
