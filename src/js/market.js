// Trending market. Reads only the market-source record handed in by main.js; no other record is consulted.
import { createPoller, getJson } from './poll.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

export function createMarket(source) {
  return createPoller(async (signal) => {
    const boosts = await getJson(source.boosts, signal);
    const seen = new Set(); const icons = new Map(); const addrs = [];
    for (const b of Array.isArray(boosts) ? boosts : []) {
      if (b.chainId !== 'solana' || !b.tokenAddress || seen.has(b.tokenAddress)) continue;
      seen.add(b.tokenAddress); icons.set(b.tokenAddress, b.icon); addrs.push(b.tokenAddress);
    }
    if (!addrs.length) throw new Error('no solana boosts');
    const pairs = await getJson(source.pairs + addrs.slice(0, 30).join(','), signal);
    const best = new Map();
    for (const p of Array.isArray(pairs) ? pairs : []) {
      const a = p?.baseToken?.address;
      if (!a || p.chainId !== 'solana') continue;
      const cur = best.get(a);
      if (!cur || num(p.volume?.h24) > num(cur.volume?.h24)) best.set(a, p);
    }
    const rows = [...best.values()].map((p) => ({
      address: p.baseToken.address,
      symbol: p.baseToken.symbol || '',
      name: p.baseToken.name || '',
      price: num(p.priceUsd),
      change: num(p.priceChange?.h24),
      volume: num(p.volume?.h24),
      liquidity: num(p.liquidity?.usd),
      marketCap: num(p.marketCap),
      imageUrl: p.info?.imageUrl || icons.get(p.baseToken.address) || '',
      url: p.url || '',
    })).filter((r) => Number.isFinite(r.volume)).sort((a, b) => b.volume - a.volume).slice(0, 10);
    if (!rows.length) throw new Error('no pairs');
    return rows;
  });
}
