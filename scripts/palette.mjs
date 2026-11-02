// Samples the brand palette from real pixels and writes src/tokens.css (the only file allowed to hold colour literals).
import fs from 'node:fs';
import sharp from 'sharp';

const LOGO = 'brand/LOGO BOOSTR PNG.png';
const REF = 'reference/BOOSTR 1.jpg.jpeg';

async function load(f) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const px = (img, i) => [img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]];
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
function hue([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}
function kmeans(points, k, iters = 30) {
  // deterministic farthest-point init
  const cent = [points[0].slice()];
  while (cent.length < k) {
    let best = null, bd = -1;
    for (const p of points) { const m = Math.min(...cent.map((c) => d2(p, c))); if (m > bd) { bd = m; best = p; } }
    cent.push(best.slice());
  }
  let assign = new Array(points.length).fill(0), size = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const sum = cent.map(() => [0, 0, 0]); size = new Array(k).fill(0);
    points.forEach((p, i) => {
      let b = 0, bd = Infinity;
      cent.forEach((c, j) => { const d = d2(p, c); if (d < bd) { bd = d; b = j; } });
      assign[i] = b; size[b]++; for (let t = 0; t < 3; t++) sum[b][t] += p[t];
    });
    cent.forEach((c, j) => { if (size[j]) for (let t = 0; t < 3; t++) c[t] = sum[j][t] / size[j]; });
  }
  return cent.map((c, j) => ({ c, n: size[j] }));
}
function snap(img, cen, filter = () => true) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < img.w * img.h; i++) {
    const p = px(img, i); if (!filter(p)) continue;
    const d = d2(p, cen); if (d < bd) { bd = d; best = i; }
  }
  return { rgb: px(img, best), x: best % img.w, y: Math.floor(best / img.w) };
}
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const logo = await load(LOGO), ref = await load(REF);
const sample = (img, pred, step) => { const out = []; for (let i = 0; i < img.w * img.h; i += step) { const p = px(img, i); if (pred(p)) out.push(p); } return out; };

const kl = kmeans(sample(logo, () => true, 53), 3).sort((a, b) => lum(a.c) - lum(b.c));
const bg = snap(logo, kl[0].c), ink = snap(logo, kl[2].c);

const sat = (p) => Math.max(...p) - Math.min(...p) > 90 && Math.max(...p) > 120;
const ks = kmeans(sample(ref, sat, 3), 5).filter((k) => k.n > 40);
const pick = (lo, hi) => ks.filter((k) => hue(k.c) >= lo && hue(k.c) <= hi).sort((a, b) => b.n - a.n)[0];
const mint = snap(ref, pick(130, 200).c, sat), violet = snap(ref, pick(240, 300).c, sat);

const kg = kmeans(sample(ref, (p) => !sat(p), 11), 5).sort((a, b) => lum(a.c) - lum(b.c));
const grey = kg.map((k) => snap(ref, k.c, (p) => !sat(p)));
console.log('greys', grey.map((g) => hex(g.rgb) + '@' + g.x + ',' + g.y), 'mint', hex(mint.rgb), 'violet', hex(violet.rgb), 'bg', hex(bg.rgb), 'ink', hex(ink.rgb));

const line = (name, s, src) => `  ${name}: ${hex(s.rgb)}; /* ${src} px(${s.x},${s.y}) */`;
const css = `/*
  Palette tokens. This is the only file in the project that may hold colour literals.
  Provenance: k-means (farthest-point init, 30 iterations) over real pixels, each centroid
  snapped to the nearest actual pixel, whose coordinate is noted beside the value.
  brand: ${LOGO} (k=3: ground and mark)
  reference: ${REF} (k=5 on saturated pixels for accents, k=5 on the rest for greys)
*/
:root {
${line('--color-bg', bg, 'logo ground')}
${line('--color-ink', ink, 'logo mark')}
${line('--color-surface', grey[1], 'reference grey 2')}
${line('--color-line', grey[2], 'reference grey 3')}
${line('--color-muted', grey[3], 'reference grey 4')}
${line('--color-mint', mint, 'reference teal cluster')}
${line('--color-violet', violet, 'reference violet cluster')}
  --color-up: var(--color-mint);
  --color-down: var(--color-violet);
}
`;
fs.mkdirSync('src', { recursive: true });
fs.writeFileSync('src/tokens.css', css);
console.log(css);
