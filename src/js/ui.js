import { $, $$, copyText, flashCopied, fmtPrice, fmtCompact, fmtPct, logoNode, reduced } from './util.js';
import { setNumber } from './motion.js';

const COPY_ICON = '<svg class="i-copy" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M5.5 1.5h7a1 1 0 0 1 1 1v7h-1.5v-6.5h-6.5v-1.5Zm-2 3h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm.5 1.5v7h5v-7h-5Z"/></svg><svg class="i-ok" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m3 8.5 3.2 3.2L13 4.8"/></svg>';
const SKEL = '<span class="skel"></span>';

function makeRow(rank, kind) {
  const r = document.createElement('div');
  r.className = 'row is-skel' + (kind === 'own' ? ' own' : '');
  r.innerHTML = `<span class="rank">${rank}</span>
    <span class="tok"><span class="skel round"></span><span class="nm"><b>${SKEL}</b><i></i></span></span>
    <span class="nums"><span class="c price" data-label="Price">${SKEL}</span><span class="c chg" data-label="24h">${SKEL}</span><span class="c vol" data-label="Volume">${SKEL}</span><span class="c liq" data-label="Liquidity">${SKEL}</span></span>
    <span class="act"><button type="button" class="copy" aria-label="Copy token address" disabled>${COPY_ICON}</button></span>`;
  return r;
}

function fillRow(row, d, i, { own = false } = {}) {
  const wasSkel = row.classList.contains('is-skel');
  row.classList.remove('is-skel');
  row.style.setProperty('--d', Math.min(i, 10) * 45 + 'ms');
  const tok = $('.tok', row);
  if (row._addr !== d.address || wasSkel) {
    row._addr = d.address;
    if (own) {
      const im = new Image(); im.className = 'logo'; im.alt = ''; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
      im.addEventListener('error', () => { im.src = 'assets/logo-192.png'; }, { once: true });
      im.src = d.imageUrl || 'assets/logo-192.png';
      tok.firstElementChild.replaceWith(im);
    } else tok.firstElementChild.replaceWith(logoNode(d.imageUrl, d.symbol, d.name));
    $('.nm b', row).textContent = d.symbol || '—';
    $('.nm i', row).textContent = d.name || '';
    const btn = $('.copy', row);
    btn.disabled = false; btn.dataset.copy = d.address;
  }
  const put = (sel, v, fmt, cls) => {
    let c = $(sel, row);
    if (c.querySelector('.skel')) { c.textContent = ''; c.classList.add('cell-in'); }
    setNumber(c, v, fmt);
    if (cls) c.classList.toggle('up', v > 0), c.classList.toggle('down', v < 0);
  };
  put('.price', d.price, fmtPrice);
  put('.chg', d.change, fmtPct, true);
  put('.vol', d.volume, fmtCompact);
  put('.liq', d.liquidity, fmtCompact);
  const liq = $('.liq', row);
  if (d.liquidityLabel === 'Mkt Cap') liq.title = 'Mkt Cap'; else liq.removeAttribute('title');
}

function dashRow(row) {
  row.classList.remove('is-skel');
  $('.nm b', row).textContent = '—';
  for (const s of ['.price', '.chg', '.vol', '.liq']) { const c = $(s, row); c.textContent = '—'; c.classList.remove('up', 'down'); }
}

function placeholderOwn(row) {
  row.classList.remove('is-skel');
  row.classList.add('is-placeholder');
  row.setAttribute('aria-disabled', 'true');
  row.dataset.slot = 'own';
  row.dataset.state = 'absent';
  const tok = $('.tok', row);
  const im = new Image(); im.className = 'logo brand-logo'; im.alt = ''; im.width = 36; im.height = 36; im.src = 'brand/boostr-logo.png';
  tok.firstElementChild.replaceWith(im);
  $('.nm b', row).textContent = 'BOOSTR';
  $('.nm i', row).textContent = 'pending';
  const cells = { '.price': '$0.00', '.chg': '· · · · ·', '.vol': '· · · · ·', '.liq': '· · · · ·' };
  for (const [s, t] of Object.entries(cells)) { const c = $(s, row); c.textContent = t; }
  const btn = $('.copy', row); btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); btn.removeAttribute('data-copy');
}

export function mountBoard({ market, own, ca }) {
  const host = $('#rows'), err = $('#board-error'), q = $('#q');
  let sort = 'volume', filter = '';
  const ownRow = makeRow(1, 'own');
  const trend = Array.from({ length: 9 }, (_, i) => makeRow(i + 2));
  host.append(ownRow, ...trend);
  if (!ca) placeholderOwn(ownRow);
  const byAddr = new Map();
  let last = { m: market.state, o: own?.state };

  const keyOf = { volume: (r) => r.volume, change: (r) => r.change, liquidity: (r) => r.liquidity };
  function renderTrend() {
    const ms = market.state;
    const data = ms.data;
    if (!data) {
      if (ms.status === 'error') trend.forEach(dashRow);
      return;
    }
    const pool = data.filter((r) => r.address !== ca).sort((a, b) => (keyOf[sort](b) || 0) - (keyOf[sort](a) || 0)).slice(0, 9);
    trend.forEach((row, i) => {
      const d = pool[i];
      if (!d) { row.hidden = true; return; }
      row.hidden = false;
      row.dataset.symbol = (d.symbol + ' ' + d.name + ' ' + d.address).toLowerCase();
      $('.rank', row).textContent = i + 2;
      fillRow(row, d, i + 1);
      byAddr.set(d.address, row);
      const hit = !filter || row.dataset.symbol.includes(filter);
      row.style.display = hit ? '' : 'none';
    });
    err.hidden = !(ms.status === 'error' || ms.status === 'stale');
  }
  function renderOwn() {
    if (!ca) return;
    const os = own.state;
    if (os.data) { ownRow.dataset.slot = 'own'; ownRow.dataset.state = 'stated'; fillRow(ownRow, os.data, 0, { own: true }); }
    else if (os.status === 'error') { ownRow.dataset.slot = 'own'; ownRow.dataset.state = 'stated'; dashRow(ownRow); $('.nm i', ownRow).textContent = 'unreachable'; }
  }
  market.subscribe(() => { renderTrend(); err.hidden = !(market.state.status === 'error' || market.state.status === 'stale'); });
  own?.subscribe(renderOwn);

  $$('.tabs [data-sort]').forEach((b) => b.addEventListener('click', () => {
    sort = b.dataset.sort;
    $$('.tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
    renderTrend();
  }));
  q.addEventListener('input', () => { filter = q.value.trim().toLowerCase(); renderTrend(); });
  addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); q.focus(); }
  });
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('.copy');
    if (!b || !b.dataset.copy) return;
    if (await copyText(b.dataset.copy)) flashCopied(b);
  });
}

export function mountTicker(market) {
  const track = $('#ticker');
  market.subscribe((s) => {
    if (!s.data) { if (s.status === 'error') track.innerHTML = '<span class="tick"><b>—</b><span class="px">source unreachable</span></span>'.repeat(4); return; }
    const make = (hide) => s.data.map((d) => {
      const el = document.createElement('span'); el.className = 'tick';
      if (hide) el.setAttribute('aria-hidden', 'true');
      el.append(logoNode(d.imageUrl, d.symbol, d.name));
      const b = document.createElement('b'); b.textContent = d.symbol || '—';
      const p = document.createElement('span'); p.className = 'px'; p.textContent = fmtPrice(d.price);
      const c = document.createElement('span'); c.className = 'c ' + (d.change >= 0 ? 'up' : 'down'); c.textContent = fmtPct(d.change);
      el.append(b, p, c); return el;
    });
    const set = [...make(false), ...make(true)];
    // The first half stays at translate 0 and the second half repeats it, so the -50% loop is seamless.
    if (!track.dataset.ready || track.children.length !== set.length) {
      track.replaceChildren(...set); track.dataset.ready = '1';
    } else {
      set.forEach((n, i) => { const old = track.children[i]; $('.px', old).textContent = $('.px', n).textContent; const c = $('.c', old); c.textContent = $('.c', n).textContent; c.className = $('.c', n).className; });
    }
  });
}

export function mountStats(market) {
  const el = (k) => $(`[data-stat="${k}"]`);
  market.subscribe((s) => {
    const d = s.data;
    if (!d) { if (s.status === 'error') ['count', 'volume', 'liquidity', 'move'].forEach((k) => { el(k).textContent = '—'; }); return; }
    setNumber(el('count'), d.length, (n) => String(Math.round(n)));
    setNumber(el('volume'), d.reduce((a, r) => a + (r.volume || 0), 0), fmtCompact);
    setNumber(el('liquidity'), d.reduce((a, r) => a + (r.liquidity || 0), 0), fmtCompact);
    const top = [...d].sort((a, b) => b.change - a.change)[0];
    setNumber(el('move'), top.change, fmtPct);
    el('moveName').textContent = top.symbol ? `Led by ${top.symbol}` : 'Best 24h change';
  });
}

export function mountBars(market) {
  const host = $('#bars');
  host.innerHTML = '<span class="none">Waiting on the feed</span>';
  market.subscribe((s) => {
    const d = s.data; if (!d) return;
    const max = Math.max(...d.map((r) => r.volume), 1);
    if (host.children.length !== d.length || host.querySelector('.none')) {
      host.replaceChildren(...d.map((r) => { const c = document.createElement('div'); c.className = 'bar-col'; c.innerHTML = '<i></i><span></span>'; return c; }));
    }
    d.forEach((r, i) => {
      const c = host.children[i];
      $('span', c).textContent = r.symbol || '—';
      const h = Math.max(4, (r.volume / max) * 100) + '%';
      const bar = $('i', c);
      if (reduced()) bar.style.height = h; else setTimeout(() => { bar.style.height = h; }, i * 60 + 40);
    });
  });
}

export function mountStatus(market) {
  const pill = $('#status'), label = $('b', pill);
  const map = { loading: ['loading', 'Syncing'], idle: ['loading', 'Syncing'], ok: ['live', 'Live'], stale: ['stale', 'Reconnecting'], error: ['down', 'Offline'] };
  market.subscribe((s) => { const [st, t] = map[s.status] || map.idle; pill.dataset.state = st; label.textContent = t; });
}

export function mountCa() {
  const btns = $$('#ca-copy[data-copy], #ca-value[data-copy]'), fb = $('#ca-fb'), copy = $('#ca-copy');
  btns.forEach((b) => b.addEventListener('click', async () => {
    if (await copyText(b.dataset.copy)) flashCopied(copy, fb);
    else { fb.textContent = 'Copy blocked here'; fb.classList.add('on'); }
  }));
}
