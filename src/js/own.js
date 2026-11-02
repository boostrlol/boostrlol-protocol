// Own token row data. Only constructed when the ca record is stated.
import { createPoller, getJson } from './poll.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

export function createOwn(ca, source) {
  return createPoller(async (signal) => {
    const [dex, pump] = await Promise.all([
      getJson(source.ownPairs + ca, signal).catch(() => null),
      getJson(source.ownCoin + ca, signal).catch(() => null),
    ]);
    console.log('[boostr] own token raw response', { dex, pump });
    if (!dex && !pump) throw new Error('own token sources unreachable');
    const pair = (dex?.pairs || [])
      .filter((p) => p?.baseToken?.address === ca)
      .sort((a, b) => num(b.volume?.h24) - num(a.volume?.h24))[0] || null;
    const liqUsd = num(pair?.liquidity?.usd);
    const mcap = num(pair?.marketCap);
    console.log('[boostr] own liquidity candidates', { liquidityUsd: liqUsd, marketCap: mcap, fdv: num(pair?.fdv) });
    const useLiq = Number.isFinite(liqUsd) && liqUsd > 0;
    return {
      address: ca,
      symbol: pair?.baseToken?.symbol || pump?.symbol || '',
      name: pair?.baseToken?.name || pump?.name || '',
      price: num(pair?.priceUsd),
      change: num(pair?.priceChange?.h24),
      volume: num(pair?.volume?.h24),
      liquidity: useLiq ? liqUsd : mcap,
      liquidityLabel: useLiq ? 'Liquidity' : 'Mkt Cap',
      imageUrl: pump?.image_uri || '',
      url: pair?.url || '',
    };
  });
}
