export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export function fmtPrice(n) {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0.00';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return '$' + n.toFixed(n >= 10 ? 2 : 3);
  const zeros = Math.floor(-Math.log10(n));
  if (zeros >= 4) {
    const digits = Math.round(n * 10 ** (zeros + 4)).toString().padStart(4, '0').slice(0, 4);
    return '$0.0' + String(zeros).split('').map((d) => SUB[d]).join('') + digits;
  }
  return '$' + n.toPrecision(4).replace(/0+$/, '').replace(/\.$/, '');
}
export function fmtCompact(n) {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}
export function fmtPct(n) {
  if (!Number.isFinite(n)) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(Math.abs(n) >= 100 ? 0 : 2) + '%';
}

// Letter tile: always two characters, so the fallback never collapses to a single glyph.
export function tileText(sym, name) {
  const pool = ((sym || '') + (name || '')).replace(/[^a-z0-9]/gi, '').toUpperCase();
  return (pool + 'BX').slice(0, 2);
}
export function logoNode(url, sym, name, cls = 'logo') {
  const mk = () => { const t = document.createElement('span'); t.className = 'tile'; t.textContent = tileText(sym, name); t.setAttribute('aria-hidden', 'true'); return t; };
  if (!url) return mk();
  const img = new Image();
  img.className = cls; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.replaceWith(mk()), { once: true });
  img.src = url;
  return img;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); return ok;
}
export function flashCopied(btn, fb) {
  btn.classList.add('is-copied');
  if (fb) { fb.textContent = 'Copied'; fb.classList.add('on'); }
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.classList.remove('is-copied'); if (fb) { fb.classList.remove('on'); fb.textContent = ''; } }, 1600);
}
