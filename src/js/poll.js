// Shared poller: 60s cadence, exponential backoff inside a cycle, paused while the tab is hidden,
// immediate fetch when it becomes visible, last good data kept when a refresh fails.
export const POLL_MS = 60000;

export async function getJson(url, signal, timeout = 12000) {
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  signal?.addEventListener('abort', stop, { once: true });
  const t = setTimeout(stop, timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); signal?.removeEventListener('abort', stop); }
}

export function createPoller(task, { tries = 4, base = 1000 } = {}) {
  const subs = new Set();
  const state = { status: 'idle', data: null, error: null };
  let timer = 0, ctl = null, running = false, busy = false;
  const emit = () => subs.forEach((f) => f(state));

  async function cycle() {
    if (busy) return;
    busy = true; ctl = new AbortController();
    if (!state.data) { state.status = 'loading'; emit(); }
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
      try {
        const data = await task(ctl.signal);
        state.data = data; state.error = null; state.status = 'ok'; emit();
        busy = false; schedule(); return;
      } catch (e) {
        if (ctl.signal.aborted && document.hidden) { busy = false; return; }
        lastErr = e;
        if (i < tries - 1) await new Promise((res) => setTimeout(res, Math.min(base * 2 ** i, 15000)));
      }
    }
    state.error = lastErr; state.status = state.data ? 'stale' : 'error'; emit();
    busy = false; schedule();
  }
  function schedule() { clearTimeout(timer); if (running && !document.hidden) timer = setTimeout(cycle, POLL_MS); }
  function onVis() {
    if (!running) return;
    if (document.hidden) { clearTimeout(timer); ctl?.abort(); busy = false; }
    else { clearTimeout(timer); cycle(); }
  }
  return {
    state,
    subscribe(f) { subs.add(f); f(state); return () => subs.delete(f); },
    start() { if (running) return; running = true; document.addEventListener('visibilitychange', onVis); if (!document.hidden) cycle(); },
    stop() { running = false; clearTimeout(timer); ctl?.abort(); document.removeEventListener('visibilitychange', onVis); },
  };
}
