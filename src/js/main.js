import { $ } from './util.js';
import { initReveal, initProgress, initParallax, initSpotlight, initWalkthrough } from './motion.js';
import { createMarket } from './market.js';
import { createOwn } from './own.js';
import { mountBoard, mountTicker, mountStats, mountBars, mountStatus, mountCa } from './ui.js';

const reg = JSON.parse($('#register').textContent);

// Keep the sticky stack aligned with the contract strip's real height.
const ca = $('.ca');
const syncCa = () => document.documentElement.style.setProperty('--ca-h', ca.offsetHeight + 'px');
new ResizeObserver(syncCa).observe(ca); syncCa();

initProgress(); initReveal(); initParallax(); initSpotlight(); initWalkthrough();
mountCa();

const src = reg['market-source'];
const market = createMarket(src.state === 'stated' ? src.value : { boosts: '', pairs: '' });
const stated = reg.ca.state === 'stated' && reg.ca.value;
const own = stated && src.state === 'stated' ? createOwn(reg.ca.value, src.value) : null;

mountStatus(market); mountTicker(market); mountStats(market); mountBars(market);
mountBoard({ market, own, ca: stated ? reg.ca.value : null });

if (src.state === 'stated') { market.start(); own?.start(); }
else market.state.status = 'error';
