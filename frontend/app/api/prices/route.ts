import { NextRequest, NextResponse } from 'next/server';

// DeFiLlama coins.llama.fi — free, no auth, generous rate limits
const LLAMA_BASE = 'https://coins.llama.fi';

// Map CoinGecko IDs (used by priceCache) → DeFiLlama IDs
const LLAMA_IDS: Record<string, string> = {
  'wrapped-steth': 'coingecko:wrapped-steth',
  'ethereum':      'coingecko:ethereum',
  'staked-ether':  'coingecko:staked-ether',
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const coinId = searchParams.get('coinId');
  const days   = searchParams.get('days');
  const from   = searchParams.get('from'); // unix seconds
  const to     = searchParams.get('to');   // unix seconds

  if (!coinId) {
    return NextResponse.json({ error: 'Missing coinId' }, { status: 400 });
  }

  const llamaId = LLAMA_IDS[coinId];
  if (!llamaId) {
    return NextResponse.json({ error: `Unknown coinId: ${coinId}` }, { status: 400 });
  }

  let startSec: number;
  let spanDays: number;

  if (from && to) {
    startSec = Number(from);
    spanDays = Math.max(1, Math.ceil((Number(to) - Number(from)) / 86400));
  } else if (days) {
    spanDays = Number(days);
    startSec = Math.floor(Date.now() / 1000) - spanDays * 86400;
  } else {
    return NextResponse.json({ error: 'Missing days or from/to' }, { status: 400 });
  }

  // searchWidth=43200 → accept prices within ±12 h of each daily slot
  const url = `${LLAMA_BASE}/chart/${llamaId}?start=${startSec}&span=${spanDays}&period=1d&searchWidth=43200`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `DeFiLlama error ${res.status}` },
      { status: res.status },
    );
  }

  const data = await res.json();
  const coinData = data?.coins?.[llamaId];

  if (!coinData?.prices?.length) {
    return NextResponse.json({ error: 'No price data returned' }, { status: 404 });
  }

  // DeFiLlama: [{ timestamp: unix_sec, price: number }]
  // priceCache expects CoinGecko format: [[timestamp_ms, price], ...]
  const prices: [number, number][] = coinData.prices.map(
    (p: { timestamp: number; price: number }) => [p.timestamp * 1000, p.price],
  );

  return NextResponse.json({ prices }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
