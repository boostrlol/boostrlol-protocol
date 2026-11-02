import { $, $$, reduced } from './util.js';

// Damped spring solver, semi-implicit Euler on a fixed 1/120s step.
export function spring(from, to, { k = 170, c = 22, m = 1 } = {}, onUpdate, onDone) {
  if (reduced()) { onUpdate(to); onDone?.(); return () => {}; }
  let x = from, v = 0, last = performance.now(), raf = 0, dead = false;
  const step = (now) => {
    if (dead) return;
    let dt = Math.min((now - last) / 1000, 0.05); last = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 120);
      v += ((-k * (x - to) - c * v) / m) * h; x += v * h; dt -= h;
    }
    onUpdate(x);
    if (Math.abs(x - to) < 0.002 && Math.abs(v) < 0.002) { onUpdate(to); onDone?.(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

export function initReveal() {
  const els = $$('[data-reveal]');
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => { e.style.opacity = 1; }); return; }
  let batch = 0, timer = 0;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const el = en.target, delay = batch++ * 80;
      setTimeout(() => spring(0, 1, { k: 150, c: 19 }, (p) => {
        el.style.opacity = Math.min(1, Math.max(0, p));
        el.style.transform = `translate3d(0, ${(1 - p) * 32}px, 0)`;
      }, () => { el.style.transform = ''; }), delay);
    }
    clearTimeout(timer); timer = setTimeout(() => { batch = 0; }, 160);
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));
}

export function initProgress() {
  const bar = $('#progress');
  const on = () => { const h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; };
  addEventListener('scroll', on, { passive: true }); addEventListener('resize', on); on();
}

export function initParallax() {
  const layers = $$('[data-depth]');
  if (reduced() || !layers.length) return;
  const hero = $('#hero');
  let px = 0, py = 0, tx = 0, ty = 0, raf = 0;
  const frame = () => {
    px += (tx - px) * 0.08; py += (ty - py) * 0.08;
    const sy = Math.min(scrollY, innerHeight * 1.2);
    for (const l of layers) {
      const d = parseFloat(l.dataset.depth);
      l.style.transform = `translate3d(${px * d * 22}px, ${py * d * 16 - sy * d * 0.12}px, 0)`;
    }
    raf = (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001) ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5; kick(); });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  addEventListener('scroll', kick, { passive: true });
}

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-spot], .row');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', e.clientX - r.left + 'px');
    t.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });
}

// Count a numeric cell toward a new value; flash on change after the first paint.
export function setNumber(el, to, fmt, { flash = true } = {}) {
  if (!Number.isFinite(to)) { el.textContent = '—'; el._v = undefined; return; }
  const from = el._v;
  el._v = to;
  if (from === to) return;
  el._cancel?.(); clearTimeout(el._done);
  if (reduced()) { el.textContent = fmt(to); return; }
  const start = Number.isFinite(from) ? from : 0;
  el.textContent = fmt(start);
  clearTimeout(el._done); el._done = setTimeout(() => { el._cancel?.(); el.textContent = fmt(to); }, 900);
  const t0 = performance.now(), dur = 650;
  let raf = 0;
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - (1 - p) ** 3;
    el.textContent = fmt(start + (to - start) * e);
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  el._cancel = () => cancelAnimationFrame(raf);
  if (flash && Number.isFinite(from)) {
    const cls = to > from ? 'flash-up' : 'flash-down';
    el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(cls);
  }
}

export function initWalkthrough() {
  const list = $('#steps'), meter = $('#meter');
  if (!list) return;
  const items = $$('li', list), N = items.length, STEP = 4000;
  let i = 0, t0 = performance.now(), paused = false, visible = false, raf = 0;
  const show = (n) => { i = n; items.forEach((li, j) => li.classList.toggle('on', j === n)); t0 = performance.now(); };
  items.forEach((li, j) => li.querySelector('button').addEventListener('click', () => { show(j); paint(); }));
  const paint = () => { meter.style.transform = `scaleX(${reduced() ? (i + 1) / N : (i + Math.min(1, (performance.now() - t0) / STEP)) / N})`; };
  if (reduced()) { paint(); return; }
  const loop = (now) => {
    if (!paused && visible && now - t0 >= STEP) show((i + 1) % N);
    paint(); raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) t0 = performance.now(); }).observe(list);
  list.addEventListener('pointerenter', () => { paused = true; });
  list.addEventListener('pointerleave', () => { paused = false; t0 = performance.now(); });
  raf = requestAnimationFrame(loop);
}
