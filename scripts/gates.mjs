// npm run gates: builds the real register plus both CA branches, runs every gate on each, then mutates a copy of the
// output and proves the gates notice. Mutation anchors read the register at runtime; none hardcode an expected state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, normalise, publicRegister, handleFromUrl } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, '.tmp', 'gates');
const FIXTURE_CA = 'So11111111111111111111111111111111111111112'; // canonical wrapped SOL mint, fixture only, never shipped
const FIXTURE_X = 'https://x.com/fixture_handle';
const FIXTURE_GH = 'https://github.com/fixture-org/fixture-repo';

const rd = (p) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const exists = (p) => fs.existsSync(p);

const X_FRAG = 'M18.244 2.25h3.308l-7.227 8.26';
const GH_FRAG = 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59';

function visibleSegments(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  const attrs = [...body.matchAll(/\s(?:aria-label|placeholder|alt|title|content)="([^"]*)"/g)].map((m) => m[1]);
  const text = body.split(/<[^>]+>/).map((s) => s.replace(/&[a-z#0-9]+;/g, ' ').trim()).filter(Boolean);
  return { text, attrs, all: [...text, ...attrs] };
}
const jsStrings = (src) => [...src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*?)\1/g)].map((m) => m[2]);
const words = (s) => (s.toLowerCase().match(/[a-z0-9']+/g) || []);
const grams = (segs) => { const g = new Set(); for (const s of segs) { const w = words(s); for (let i = 0; i + 1 < w.length; i++) g.add(w[i] + ' ' + w[i + 1]); } return g; };

const DATE_RES = [
  /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
  /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
  /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/,
  /\b(?:as of|checked|last updated|updated on|timestamp)\b/i,
  /\bcopyright\b|©/i,
  /\b20[0-4]\d\b/,
  /\b\d+\s*(?:s|sec|seconds?|m|min|minutes?|h|hours?|d|days?)\s+ago\b/i,
];

const ADDR_B58 = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const ADDR_0X = /\b0x[0-9a-fA-F]{40}\b/g;
export function scanAddresses(text, registryValues) {
  const hits = [];
  for (const m of text.matchAll(ADDR_B58)) { const s = m[0]; if (/\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s)) hits.push(s); }
  for (const m of text.matchAll(ADDR_0X)) hits.push(m[0]);
  return hits.filter((h) => !registryValues.has(h));
}

function statedValues(recs) {
  const v = new Set();
  for (const r of Object.values(recs)) {
    if (r.state !== 'stated') continue;
    if (typeof r.value === 'string') v.add(r.value);
    if (r.value && typeof r.value === 'object') Object.values(r.value).forEach((x) => typeof x === 'string' && v.add(x));
  }
  return v;
}

function attrOf(tag, name) { const m = tag.match(new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s>/])`)); return m ? (m[1] ?? '') : null; }
function socialTags(html) {
  const out = {};
  for (const id of ['x', 'github']) {
    const m = html.match(new RegExp(`<(a|span)\\b[^>]*data-social="${id}"[^>]*>([\\s\\S]*?)</\\1>`));
    out[id] = m ? { tag: m[0].slice(0, m[0].indexOf('>') + 1), name: m[1], inner: m[2] } : null;
  }
  return out;
}

// Every gate: (ctx) => string[] of failures. ctx = { dist, recs, html, css, tokens, js, jsAll, repo }
export const GATES = [
  ['outputs-present', (c) => ['index.html', 'favicon.svg', 'css/tokens.css', 'css/styles.css', 'js/main.js', 'js/market.js', 'assets/logo-192.png', 'brand/boostr-logo.png'].filter((f) => !exists(path.join(c.dist, f))).map((f) => `missing ${f}`)],
  ['register-inert-clean', (c) => Object.entries(c.regRaw).filter(([, r]) => r.state !== 'stated' && (r.value !== undefined || r.url !== undefined)).map(([k]) => `inert record ${k} carries value or url`)],
  ['register-states-valid', (c) => Object.entries(c.regRaw).filter(([, r]) => !['stated', 'absent', 'unconfirmed'].includes(r.state)).map(([k]) => `bad state on ${k}`)],
  ['register-embedded-matches', (c) => {
    const m = c.html.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/);
    if (!m) return ['no embedded register'];
    const emb = JSON.parse(m[1]); const f = [];
    for (const [k, r] of Object.entries(c.recs)) { if (!emb[k] || emb[k].state !== r.state) f.push(`embedded state mismatch ${k}`); if (r.state !== 'stated' && emb[k] && ('value' in emb[k] || 'url' in emb[k])) f.push(`embedded inert ${k} leaks`); }
    return f;
  }],
  ['ca-slot-follows-register', (c) => {
    const rec = c.recs.ca, f = [];
    const sec = c.html.match(/<section class="ca"[\s\S]*?<\/section>/)?.[0] || '';
    if (!sec) return ['ca slot missing'];
    const st = sec.match(/data-state="([^"]*)"/)?.[1];
    if (rec.state === 'stated') {
      if (st !== 'stated') f.push('ca slot state not stated');
      if (!sec.includes(`>${rec.value}</button>`)) f.push('full address not rendered');
      if ((sec.match(new RegExp(`data-copy="${rec.value}"`, 'g')) || []).length < 2) f.push('copy targets missing the address');
    } else {
      if (st === 'stated') f.push('ca slot claims stated');
      if (!sec.includes('>pending<')) f.push('inert ca lacks pending label');
      if (/data-copy=/.test(sec)) f.push('inert ca carries a copy target');
      if (!/id="ca-copy"[^>]*disabled/.test(sec)) f.push('inert copy control not disabled');
      if (scanAddresses(sec, new Set()).length) f.push('inert ca carries an address-shaped string');
    }
    return f;
  }],
  ['ca-slot-top-and-large', (c) => {
    const f = [];
    if (c.html.indexOf('class="ca"') > c.html.indexOf('<header') || c.html.indexOf('class="ca"') < 0) f.push('ca slot is not above the header');
    if (!/\.ca \{[^}]*position: sticky;[^}]*top: 0/.test(c.css)) f.push('ca slot not sticky at top');
    if (!/\.ca-value \{[^}]*font:[^;]*clamp\(15px, 2\.2vw, 26px\)/.test(c.css)) f.push('ca font not large');
    if (!/\.ca-value \{[^}]*overflow-wrap: anywhere/.test(c.css)) f.push('full address could be clipped');
    return f;
  }],
  ['ca-copy-feedback', (c) => {
    const f = [];
    if (!/flashCopied\(copy, fb\)/.test(c.js.ui)) f.push('ca copy feedback not wired');
    if (!/aria-live="polite"/.test(c.html)) f.push('no live region for feedback');
    return f;
  }],
  ['social-follows-register', (c) => {
    const f = []; const tags = socialTags(c.html);
    for (const id of ['x', 'github']) {
      const t = tags[id], rec = c.recs[id];
      if (!t) { f.push(`${id} icon missing`); continue; }
      const href = attrOf(t.tag, 'href');
      if (rec.state === 'stated') {
        if (t.name !== 'a' || href !== rec.url) f.push(`${id} stated but not linked to the register url`);
        const h = handleFromUrl(rec.url);
        if (h && !attrOf(t.tag, 'aria-label')?.includes(h)) f.push(`${id} label lacks derived handle`);
      } else {
        if (href !== null) f.push(`${id} inert but has href`);
        if (t.name === 'a') f.push(`${id} inert but is an anchor`);
        if (attrOf(t.tag, 'aria-disabled') !== 'true') f.push(`${id} inert but not aria-disabled`);
        if (/https?:\/\//.test(t.tag)) f.push(`${id} inert carries a url`);
      }
    }
    return f;
  }],
  ['social-official-marks-icon-only', (c) => {
    const f = []; const tags = socialTags(c.html);
    if (tags.x && !tags.x.inner.includes(X_FRAG)) f.push('x mark is not the official path');
    if (tags.github && !tags.github.inner.includes(GH_FRAG)) f.push('github mark is not the official octicon path');
    for (const id of ['x', 'github']) if (tags[id] && tags[id].inner.replace(/<svg[\s\S]*?<\/svg>/g, '').trim()) f.push(`${id} icon has a text label`);
    return f;
  }],
  ['social-top-right-all-breakpoints', (c) => {
    const f = [];
    const end = c.html.match(/<section class="ca"[\s\S]*?<\/section>/)?.[0] || '';
    if (end.lastIndexOf('class="socials"') < end.lastIndexOf('id="ca-fb"') || !end.includes('class="socials"')) f.push('socials are not the last item of the top strip');
    if (/\.socials \{[^}]*display: none/.test(c.css) || /\.social \{[^}]*display: none/.test(c.css)) f.push('socials hidden at a breakpoint');
    if (/@media[^{]*\{[^@]*\.socials?\s*\{[^}]*display:\s*none/.test(c.css)) f.push('socials hidden in a media query');
    return f;
  }],
  ['no-dates-anywhere', (c) => {
    const f = []; const seg = visibleSegments(c.html);
    const strings = [...seg.all, ...Object.values(c.js).flatMap(jsStrings), ...[...c.css.matchAll(/content:\s*"([^"]*)"/g)].map((m) => m[1])];
    for (const s of strings) for (const re of DATE_RES) if (re.test(s)) { f.push(`date-like text: ${s.slice(0, 50)}`); break; }
    if (/\bchecked\b|"checked"/.test(c.html.match(/id="register">([\s\S]*?)<\/script>/)?.[1] || '')) f.push('register payload carries provenance');
    return f;
  }],
  ['colour-literals-only-in-tokens', (c) => {
    const re = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
    const f = [];
    const body = c.html.replace(/<svg[\s\S]*?<\/svg>/g, '');
    if (re.test(body.replace(/&#\d+;/g, ''))) f.push('literal in html');
    if (re.test(c.css)) f.push('literal in styles.css');
    for (const [k, v] of Object.entries(c.js)) if (re.test(v)) f.push(`literal in js/${k}`);
    if (!re.test(c.tokens)) f.push('tokens file holds no literals');
    return f;
  }],
  ['palette-provenance-recorded', (c) => /k-means/.test(c.tokens) && /px\(\d+,\d+\)/.test(c.tokens) ? [] : ['tokens lack k-means provenance or pixel coordinates']],
  ['no-ch-units', (c) => /\d\s?ch\b/.test(c.css) || /\d\s?ch\b/.test(c.html) ? ['ch unit in use'] : []],
  ['address-scanner', (c) => {
    const reg = statedValues(c.recs);
    const bad = scanAddresses([c.html, c.css, ...Object.values(c.js)].join('\n'), reg);
    return bad.map((b) => `address-shaped string not in stated registry: ${b}`);
  }],
  ['address-scanner-self-test', () => {
    const hex = '0x' + 'ab12'.repeat(10);
    const f = [];
    if (scanAddresses(`x ${hex} y`, new Set()).length !== 1) f.push('unregistered 0x not flagged');
    if (scanAddresses(`x ${hex} y`, new Set([hex])).length !== 0) f.push('registered 0x wrongly rejected');
    if (scanAddresses(`x ${FIXTURE_CA} y`, new Set([FIXTURE_CA])).length !== 0) f.push('registered base58 wrongly rejected');
    if (scanAddresses(`x ${FIXTURE_CA} y`, new Set()).length !== 1) f.push('unregistered base58 not flagged');
    return f;
  }],
  ['market-ignores-ca', (c) => {
    const f = [];
    if (/\bca\b|own|register|reg\[/.test(c.js['market.js'].replace(/\/\/.*$/gm, ''))) f.push('market.js touches ca, own or the register');
    if (/import[^;]*own/.test(c.js['market.js'])) f.push('market imports own');
    return f;
  }],
  ['market-source-endpoints', (c) => {
    const v = c.regRaw['market-source'];
    if (v.state !== 'stated') return [];
    const f = [];
    if (v.value.boosts !== 'https://api.dexscreener.com/token-boosts/top/v1') f.push('boost endpoint changed');
    if (v.value.pairs !== 'https://api.dexscreener.com/tokens/v1/solana/') f.push('pairs endpoint changed');
    if (!/b\.chainId !== 'solana'/.test(c.js['market.js'])) f.push('solana filter missing');
    if (!/slice\(0, 10\)/.test(c.js['market.js']) || !/b\.volume - a\.volume/.test(c.js['market.js'])) f.push('top 10 by volume missing');
    return f;
  }],
  ['poll-contract', (c) => {
    const p = c.js['poll.js'], f = [];
    if (!/POLL_MS = 60000/.test(p)) f.push('not 60s');
    if (!/visibilitychange/.test(p) || !/document\.hidden/.test(p)) f.push('no visibility pause');
    if (!/2 \*\* i/.test(p)) f.push('no exponential backoff');
    if (!/state\.data \? 'stale' : 'error'/.test(p)) f.push('last good data not kept');
    return f;
  }],
  ['own-row-contract', (c) => {
    const o = c.js['own.js'], u = c.js['ui.js'], f = [];
    if (!/Promise\.all/.test(o)) f.push('own fetch not parallel');
    if (!/baseToken\?\.address === ca/.test(o) || !/volume\?\.h24\) - num/.test(o)) f.push('pair selection wrong');
    if (!/pump\?\.image_uri/.test(o)) f.push('logo not from pump.fun');
    if (!/assets\/logo-192\.png/.test(u)) f.push('logo fallback missing');
    if (!/\[boostr\] own token raw response/.test(o) || !/\[boostr\] own liquidity candidates/.test(o)) f.push('console markers missing');
    if (!/liqUsd > 0/.test(o) || !/'Mkt Cap'/.test(o)) f.push('liquidity fallback missing');
    if (/dd\.dexscreener\.com/.test(Object.values(c.js).join('') + c.html)) f.push('dexscreener cdn logo used');
    if (!/r\.address !== ca/.test(u)) f.push('dedup missing');
    if (!/\.row\.own \{[^}]*border-left: 2px solid var\(--color-mint\);[^}]*animation: ownPulse 2s ease-in-out infinite/.test(c.css)) f.push('own row style missing');
    if (!/@keyframes ownPulse/.test(c.css)) f.push('ownPulse keyframes missing');
    if (!/prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/.test(c.css)) f.push('reduced motion does not stop ownPulse');
    return f;
  }],
  ['own-row-absent-placeholder', (c) => {
    const u = c.js['ui.js'], f = [];
    if (!/function placeholderOwn/.test(u) || !/brand\/boostr-logo\.png/.test(u)) f.push('placeholder lacks the brand logo');
    const fn = u.match(/function placeholderOwn[\s\S]*?\n}\n/)?.[0] || '';
    if (/tileText|logoNode/.test(fn)) f.push('placeholder uses a letter tile');
    if (!/\$0\.00/.test(fn) || !/· · · · ·/.test(fn)) f.push('placeholder data missing');
    if (!/is-placeholder \{ pointer-events: none/.test(c.css)) f.push('placeholder is clickable');
    if (c.recs.ca.state !== 'stated' && !c.js['ui.js'].includes("if (!ca) placeholderOwn(ownRow)")) f.push('absent branch does not draw placeholder');
    return f;
  }],
  ['letter-tile-threshold', async (c) => {
    const f = [];
    const u = await import(pathToFileURL(path.join(c.dist, 'js', 'util.js')).href + '?v=' + Math.random());
    for (const [s, n] of [['', ''], ['A', ''], ['$', '!'], ['SOL', 'Solana'], ['x', 'y']]) if (u.tileText(s, n).length < 2) f.push(`tile shorter than 2 for ${s}/${n}`);
    return f;
  }],
  ['own-token-never-letter-tile', (c) => {
    const u = c.js['ui.js'];
    const own = u.match(/if \(own\) \{[\s\S]*?\} else tok/)?.[0] || '';
    return /logoNode|tileText/.test(own) ? ['own row uses letter tile'] : [];
  }],
  ['reduced-motion-everywhere', (c) => {
    const f = [];
    if (!/@media \(prefers-reduced-motion: reduce\)/.test(c.css)) f.push('css lacks reduced-motion block');
    if (!/animation: none !important;\s*transition: none !important/.test(c.css)) f.push('css does not stop animation and transition');
    for (const k of ['motion.js', 'ui.js']) if (!/reduced\(\)/.test(c.js[k])) f.push(`${k} ignores reduced motion`);
    if (!/\.js \[data-reveal\] \{ opacity: 1 !important/.test(c.css)) f.push('reveal not instant');
    return f;
  }],
  ['motion-features-present', (c) => {
    const f = [];
    if (!/export function spring/.test(c.js['motion.js'])) f.push('no spring solver');
    if (!/initParallax/.test(c.js['motion.js']) || !/pointermove/.test(c.js['motion.js'])) f.push('no parallax');
    if (!/setNumber/.test(c.js['motion.js']) || !/flash-up/.test(c.js['motion.js'])) f.push('no count-up flash');
    if (!/radial-gradient\(\d+px circle at var\(--mx/.test(c.css)) f.push('no spotlight');
    if (!/id="progress"/.test(c.html)) f.push('no progress bar');
    if (!/class="pill"/.test(c.html) || !/\.dot/.test(c.css)) f.push('no live pill');
    if (!/class="mesh"/.test(c.html) || !/@keyframes drift/.test(c.css)) f.push('no hero mesh');
    if (!/24s linear infinite/.test(c.css) || !/@keyframes ticker/.test(c.css)) f.push('ticker timing off');
    if (!/\.skel::after/.test(c.css) || !/is-skel/.test(c.js['ui.js'])) f.push('skeletons missing');
    return f;
  }],
  ['tap-targets-44', (c) => {
    const need = ['.social', '.ca-copy', '.copy', '.tabs button', '.nav a', 'button.ca-value', '.search', '.steps button', '.btn'];
    const f = [];
    for (const sel of need) {
      const re = new RegExp('(?:^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}');
      const body = c.css.match(re)?.[1] || '';
      if (!/(?:min-)?height: (?:44|48)px/.test(body)) f.push(`${sel} lacks a 44px height`);
    }
    return f;
  }],
  ['favicon-valid', (c) => {
    const s = rd(path.join(c.dist, 'favicon.svg')), f = [];
    if (!/viewBox="0 0 32 32"/.test(s) || !/width="32"/.test(s) || !/height="32"/.test(s)) f.push('not 32x32');
    if (s.includes('--') || s.includes('<!--')) f.push('contains a double hyphen or comment');
    if (!/<path[^>]* d="M/.test(s) || s.length < 800) f.push('not traced');
    if (!/rel="icon" type="image\/svg\+xml" href="favicon\.svg"/.test(c.html)) f.push('not linked');
    return f;
  }],
  ['local-references-resolve', (c) => {
    const f = [];
    for (const m of c.html.matchAll(/(?:src|href)="([^"#:]+)"/g)) { const p = m[1]; if (/^(https?:)?\/\//.test(p)) continue; if (!exists(path.join(c.dist, p))) f.push(`dangling ${p}`); }
    for (const m of c.js['main.js'].matchAll(/from '\.\/([^']+)'/g)) if (!exists(path.join(c.dist, 'js', m[1]))) f.push(`dangling module ${m[1]}`);
    return f;
  }],
  ['logo-transparent-handled', async (c) => {
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(path.join(c.dist, 'brand', 'boostr-logo.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let fringe = 0;
    for (let i = 0; i < info.width * info.height; i++) { const a = data[i * 4 + 3]; if (a >= 48 && a < 255) { const lum = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3; if (lum < 90) fringe++; } }
    return fringe > 40 ? [`dark fringe pixels after resize: ${fringe}`] : [];
  }],
  ['repo-hygiene', (c) => {
    const f = [];
    for (const p of ['CLAUDE.md', '.claude']) if (exists(path.join(c.repo, p))) f.push(`${p} exists`);
    const bad = new RegExp(['cla' + 'ude', 'anthro' + 'pic', 'chat' + 'gpt', 'open' + 'ai', 'gener' + 'ated by', 'co-' + 'authored', '\\bA' + 'I\\b'].join('|'), 'i');
    const files = [...walk(c.repo).filter((p) => !/node_modules|scripts[\\/]gates\.mjs|[\\/]\.tmp[\\/]|[\\/]brand[\\/]|[\\/]reference[\\/]|package-lock|scripts[\\/]refcopy|\.png$|\.jpe?g$|\.jpeg$/.test(p)), ...walk(c.dist)];
    for (const p of files) { if (!/\.(md|json|js|mjs|css|html|svg|txt|yml|yaml)$|LICENSE|_headers/.test(p)) continue; if (bad.test(rd(p).replace(/gates\.mjs/, ''))) f.push(`attribution-like text in ${path.relative(c.repo, p)}`); }
    return f;
  }],
  ['repo-content-files', (c) => {
    const f = [];
    for (const p of ['README.md', 'docs/whitepaper.md', 'LICENSE']) if (!exists(path.join(c.repo, p))) f.push(`missing ${p}`);
    for (const p of ['README.md', 'docs', 'LICENSE']) if (exists(path.join(c.dist, p))) f.push(`${p} leaked into dist`);
    if (exists(path.join(c.repo, 'LICENSE'))) { const l = rd(path.join(c.repo, 'LICENSE')); if (!/MIT License/.test(l) || !/BOOSTR, 2026/.test(l)) f.push('LICENSE not MIT BOOSTR 2026'); }
    return f;
  }],
  ['copy-no-shared-2grams', (c) => {
    const ref = grams(rd(path.join(c.repo, 'scripts', 'refcopy.txt')).split('\n'));
    const ours = grams([...visibleSegments(c.html).all, ...jsStrings(c.js['ui.js']).filter((s) => /^[A-Z][A-Za-z0-9 ,.'—·]+$/.test(s) && / /.test(s)), ...jsStrings(c.js['main.js']).filter((s) => /^[A-Z][A-Za-z0-9 ,.'—·]+$/.test(s) && / /.test(s))]);
    return [...ours].filter((g) => ref.has(g)).map((g) => `shared 2-gram: "${g}"`);
  }],
];

async function load(dist, regPath) {
  const regRaw = normalise(JSON.parse(rd(regPath)));
  const js = {}; for (const f of fs.readdirSync(path.join(dist, 'js'))) js[f] = rd(path.join(dist, 'js', f));
  js.ui = js['ui.js'];
  const ctx = { dist, repo: ROOT, regRaw, recs: regRaw, html: rd(path.join(dist, 'index.html')), css: rd(path.join(dist, 'css', 'styles.css')), tokens: rd(path.join(dist, 'css', 'tokens.css')), js };
  return ctx;
}
async function runAll(label, ctx) {
  const rows = [];
  for (const [name, fn] of GATES) { let r; try { r = await fn(ctx); } catch (e) { r = ['threw ' + e.message]; } rows.push({ label, name, ok: r.length === 0, detail: r }); }
  return rows;
}

function fixtureRegister(src, mode) {
  const r = JSON.parse(rd(src));
  const on = mode === 'stated';
  const set = (id, patch) => { const rec = r.records[id]; if (on) Object.assign(rec, { state: 'stated' }, patch); else { rec.state = 'absent'; delete rec.value; delete rec.url; } };
  set('ca', { value: FIXTURE_CA }); set('x', { url: FIXTURE_X }); set('github', { url: FIXTURE_GH });
  return r;
}

export async function main() {
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
  const realReg = path.join(ROOT, 'register.json');
  const branches = { real: { dist: path.join(ROOT, 'dist'), reg: realReg } };
  for (const mode of ['absent', 'stated']) {
    const reg = path.join(TMP, `${mode}.json`); fs.writeFileSync(reg, JSON.stringify(fixtureRegister(realReg, mode)));
    branches[mode] = { dist: path.join(TMP, mode), reg };
    await build({ registerPath: reg, out: branches[mode].dist });
  }
  if (!exists(path.join(ROOT, 'dist', 'index.html'))) throw new Error('dist missing: run npm run build first');

  let all = [];
  const ctxs = {};
  for (const [label, b] of Object.entries(branches)) { ctxs[label] = await load(b.dist, b.reg); all = all.concat(await runAll(label, ctxs[label])); }

  // Cross-branch gates
  const cross = [];
  const same = (f) => rd(path.join(branches.absent.dist, f)) === rd(path.join(branches.stated.dist, f));
  cross.push({ label: 'cross', name: 'market-code-identical-across-ca-states', ok: same('js/market.js') && same('js/poll.js'), detail: ['market.js or poll.js differs between absent and stated'] });
  cross.push({ label: 'cross', name: 'ca-absent-branch-is-inert', ok: !ctxs.absent.html.includes(FIXTURE_CA) && /data-state="absent"/.test(ctxs.absent.html), detail: ['absent build leaks an address or lacks absent state'] });
  cross.push({ label: 'cross', name: 'ca-stated-branch-is-live', ok: ctxs.stated.html.includes(`>${FIXTURE_CA}</button>`) && /href="https:\/\/x\.com\/fixture_handle"/.test(ctxs.stated.html) && /href="https:\/\/github\.com\/fixture-org\/fixture-repo"/.test(ctxs.stated.html), detail: ['stated build did not render the stated records'] });
  all = all.concat(cross);

  // Mutation harness
  const mutations = [];
  const real = ctxs.real;
  const mut = async (name, expectGate, edit) => {
    const d = path.join(TMP, 'mut-' + name); fs.rmSync(d, { recursive: true, force: true }); fs.cpSync(real.dist, d, { recursive: true });
    const ctx = { ...(await load(d, realReg)), dist: d };
    edit(ctx, d);
    const gate = GATES.find((g) => g[0] === expectGate);
    const r = await gate[1](ctx);
    mutations.push({ name, gate: expectGate, caught: r.length > 0 });
  };
  const wr = (d, f, s) => fs.writeFileSync(path.join(d, f), s);
  await mut('social-flip', 'social-follows-register', (c, d) => {
    const st = c.recs.x.state;
    c.html = st === 'stated' ? c.html.replace(/(<a class="social" data-social="x"[^>]*?) href="[^"]*"/, '$1') : c.html.replace('<span class="social is-inert" data-social="x"', '<span class="social is-inert" href="https://x.com/z" data-social="x"');
  });
  await mut('ca-flip', 'ca-slot-follows-register', (c) => {
    c.html = c.recs.ca.state === 'stated' ? c.html.replace(/(<button type="button" class="ca-value"[^>]*>)[^<]*/, '$1truncated') : c.html.replace('>pending<', `>${FIXTURE_CA}<`);
  });
  await mut('inert-record-value', 'register-inert-clean', (c) => { const k = Object.entries(c.regRaw).find(([, r]) => r.state !== 'stated')?.[0]; c.regRaw[k] = { ...c.regRaw[k], value: 'leak' }; });
  await mut('date-injected', 'no-dates-anywhere', (c) => { c.html = c.html.replace('<footer', '<p>Checked on 2026-11-02</p><footer'); });
  await mut('hex-outside-tokens', 'colour-literals-only-in-tokens', (c) => { c.css += '\n.x { color: #123456; }'; });
  await mut('ch-unit', 'no-ch-units', (c) => { c.css += '\n.x { max-width: 60ch; }'; });
  await mut('foreign-address', 'address-scanner', (c) => { c.html += ' 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin '; });
  await mut('foreign-0x', 'address-scanner', (c) => { c.html += ' 0x' + 'Ab9'.repeat(14).slice(0, 40) + ' '; });
  await mut('reduced-motion-removed', 'reduced-motion-everywhere', (c) => { c.css = c.css.replace('@media (prefers-reduced-motion: reduce)', '@media print'); });
  await mut('favicon-comment', 'favicon-valid', (c, d) => { wr(d, 'favicon.svg', rd(path.join(d, 'favicon.svg')).replace('<rect', '<!-- a -- b --><rect')); });
  await mut('placeholder-letter-tile', 'own-row-absent-placeholder', (c) => { c.js['ui.js'] = c.js['ui.js'].replace(/(function placeholderOwn[\s\S]*?)brand\/boostr-logo\.png/, '$1logoNode'); });
  await mut('market-reads-ca', 'market-ignores-ca', (c) => { c.js['market.js'] += "\nconst x = reg.ca;"; });
  await mut('borrowed-phrase', 'copy-no-shared-2grams', (c) => { c.html = c.html.replace('<footer', '<p>Waiting for indexer</p><footer'); });
  await mut('social-label', 'social-official-marks-icon-only', (c) => { c.html = c.html.replace(/(data-social="github"[^>]*>)/, '$1GitHub '); });
  await mut('dexscreener-cdn-logo', 'own-row-contract', (c) => { c.js['ui.js'] += "\nconst l='https://dd.dexscreener.com/ds-data/tokens/solana/x.png';"; });

  const failed = all.filter((r) => !r.ok);
  const missed = mutations.filter((m) => !m.caught);
  const names = [...new Set(all.map((r) => r.name))];
  for (const label of Object.keys(branches).concat('cross')) {
    const rs = all.filter((r) => r.label === label);
    console.log(`\n[${label}] ${rs.filter((r) => r.ok).length}/${rs.length} gates pass`);
    for (const r of rs.filter((x) => !x.ok)) console.log('  FAIL', r.name, '->', r.detail.slice(0, 6).join(' | '));
  }
  console.log(`\nmutations caught: ${mutations.filter((m) => m.caught).length}/${mutations.length}`);
  for (const m of missed) console.log('  MISSED', m.name, '(expected', m.gate + ')');
  console.log(`\ndistinct gates: ${names.length}  |  gate runs: ${all.length}  |  mutation checks: ${mutations.length}`);
  console.log(`real register states: ${Object.entries(real.recs).map(([k, r]) => `${k}=${r.state}`).join(', ')}`);
  fs.rmSync(TMP, { recursive: true, force: true });
  const bad = failed.length + missed.length;
  console.log(bad ? `\nGATES FAILED (${bad})` : '\nALL GATES PASS');
  process.exit(bad ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
