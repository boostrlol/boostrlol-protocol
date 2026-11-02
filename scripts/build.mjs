import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(ROOT, 'brand', 'LOGO BOOSTR PNG...png'); // colourtype 6, transparent ground (alpha 0, rgb 0)
const BANNER = path.join(ROOT, 'reference', 'SAMPUL BOOSTR JPG.jpg.jpeg');

const X_PATH = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const GH_PATH = 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';
const ICONS = {
  x: { vb: '0 0 24 24', d: X_PATH, name: 'X' },
  github: { vb: '0 0 16 16', d: GH_PATH, name: 'GitHub' },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function handleFromUrl(url) {
  try { const seg = new URL(url).pathname.split('/').filter(Boolean)[0]; return seg || null; } catch { return null; }
}

// Rule 1: inert records never carry value or url.
export function normalise(reg) {
  const out = {};
  for (const [id, rec] of Object.entries(reg.records)) {
    const r = { ...rec };
    if (r.state !== 'stated') { delete r.value; delete r.url; }
    out[id] = r;
  }
  return out;
}

// Public form: no provenance dates, no source notes.
export function publicRegister(recs) {
  const o = {};
  for (const [id, r] of Object.entries(recs)) {
    o[id] = { state: r.state };
    if (r.state === 'stated') { if (r.value !== undefined) o[id].value = r.value; if (r.url) o[id].url = r.url; }
  }
  return o;
}

function socialHtml(id, rec) {
  const ic = ICONS[id];
  const svg = `<svg viewBox="${ic.vb}" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="${ic.d}"/></svg>`;
  if (rec.state === 'stated' && rec.url) {
    const h = handleFromUrl(rec.url);
    const label = h ? `${ic.name}, @${h}` : ic.name;
    return `<a class="social" data-social="${id}" data-state="stated" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}">${svg}</a>`;
  }
  return `<span class="social is-inert" data-social="${id}" data-state="${esc(rec.state)}" role="img" aria-disabled="true" aria-label="${ic.name}, pending">${svg}</span>`;
}

function caHtml(rec, socials) {
  const on = rec.state === 'stated' && rec.value;
  const copyIc = '<svg class="i-copy" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M5.5 1.5h7a1 1 0 0 1 1 1v7h-1.5v-6.5h-6.5v-1.5Zm-2 3h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm.5 1.5v7h5v-7h-5Z"/></svg><svg class="i-ok" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m3 8.5 3.2 3.2L13 4.8"/></svg>';
  return `<section class="ca" data-slot="ca" data-state="${on ? 'stated' : esc(rec.state)}" aria-label="Contract address">
  <div class="ca-in">
    <span class="ca-label">Contract</span>
    ${on ? `<button type="button" class="ca-value" id="ca-value" data-copy="${esc(rec.value)}" aria-label="Copy contract address">${esc(rec.value)}</button>` : `<span class="ca-value is-inert" id="ca-value">pending</span>`}
    <button type="button" class="ca-copy" id="ca-copy"${on ? ` data-copy="${esc(rec.value)}"` : ' disabled aria-disabled="true"'} aria-label="Copy contract address">${copyIc}<span class="ca-copy-t">Copy</span></button>
    <span class="ca-fb" id="ca-fb" role="status" aria-live="polite"></span>
    <div class="socials">${socials}</div>
  </div>
</section>`;
}

function render(tpl, recs) {
  const socials = ['x', 'github'].map((id) => socialHtml(id, recs[id])).join('');
  const chain = recs.chain;
  return tpl
    .replace('{{register}}', JSON.stringify(publicRegister(recs)).replace(/</g, '\\u003c'))
    .replace('{{ca}}', caHtml(recs.ca, socials))
    .replaceAll('{{chain_state}}', esc(chain.state))
    .replaceAll('{{chain_name}}', chain.state === 'stated' ? esc(chain.value.name) : 'pending');
}

// Trace the logo's real pixel grid onto a 32x32 SVG; each opaque cell becomes part of a merged run.
async function faviconSvg(tokens) {
  const mark = tokens.ink, bg = tokens.bg;
  const trimmed = await sharp(LOGO).trim({ threshold: 8 }).toBuffer({ resolveWithObject: true });
  const side = Math.max(trimmed.info.width, trimmed.info.height);
  const G = 64;
  const { data } = await sharp(trimmed.data)
    .resize(G - 4, G - 4, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 2, bottom: 2, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  void side;
  let d = '';
  for (let y = 0; y < G; y++) {
    let x = 0;
    while (x < G) {
      if (data[(y * G + x) * 4 + 3] >= 128) {
        let x2 = x; while (x2 < G && data[(y * G + x2) * 4 + 3] >= 128) x2++;
        d += `M${x / 2} ${y / 2}h${(x2 - x) / 2}v.5h${-(x2 - x) / 2}z`;
        x = x2;
      } else x++;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${bg}"/><path fill="${mark}" d="${d}"/></svg>\n`;
}

function readTokens() {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'tokens.css'), 'utf8');
  const get = (n) => css.match(new RegExp(`--color-${n}:\\s*(#[0-9a-fA-F]{6})`))[1];
  return { bg: get('bg'), ink: get('ink') };
}

export async function build({ registerPath = path.join(ROOT, 'register.json'), out = path.join(ROOT, 'dist') } = {}) {
  const reg = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
  const recs = normalise(reg);
  fs.rmSync(out, { recursive: true, force: true });
  for (const d of ['css', 'js', 'assets', 'brand']) fs.mkdirSync(path.join(out, d), { recursive: true });

  fs.copyFileSync(path.join(ROOT, 'src', 'tokens.css'), path.join(out, 'css', 'tokens.css'));
  fs.copyFileSync(path.join(ROOT, 'src', 'styles.css'), path.join(out, 'css', 'styles.css'));
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'js'))) fs.copyFileSync(path.join(ROOT, 'src', 'js', f), path.join(out, 'js', f));

  fs.writeFileSync(path.join(out, 'index.html'), render(fs.readFileSync(path.join(ROOT, 'src', 'index.template.html'), 'utf8'), recs));
  fs.writeFileSync(path.join(out, 'favicon.svg'), await faviconSvg(readTokens()));

  // sharp premultiplies alpha before resampling, so the pure-black transparent ground cannot bleed into mark edges.
  const logo = sharp(LOGO).trim({ threshold: 8 });
  const sq = async (size, file, pad = 0) => {
    const inner = size - pad * 2;
    await sharp(await logo.clone().toBuffer())
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 }).toFile(path.join(out, file));
  };
  await sq(192, 'assets/logo-192.png');
  await sq(512, 'brand/boostr-logo.png');
  const tk = readTokens();
  const hexToRgb = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
  await sharp(await logo.clone().toBuffer()).resize(140, 140, { fit: 'contain', background: { ...hexToRgb(tk.bg), alpha: 0 } })
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { ...hexToRgb(tk.bg), alpha: 1 } })
    .flatten({ background: hexToRgb(tk.bg) }).png().toFile(path.join(out, 'assets', 'apple-touch-icon.png'));
  await sharp(BANNER).jpeg({ quality: 86 }).toFile(path.join(out, 'assets', 'og.jpg'));

  fs.writeFileSync(path.join(out, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/assets/*\n  Cache-Control: public, max-age=604800\n');
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const out = await build({ registerPath: opt('--register') && path.resolve(opt('--register')), out: opt('--out') && path.resolve(opt('--out')) });
  console.log('built ->', out);
}
