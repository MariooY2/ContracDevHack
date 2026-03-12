import { NextResponse } from 'next/server';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Map collateral symbols to DeFiLlama pool IDs (Base chain staking pools)
// These are the main staking yield pools for each LST
const POOL_MAP: Record<string, string> = {
  wstETH: '747c1d2a-c668-4571-a395-21571f3314e4', // Lido stETH
  weETH: 'bc914b3c-12af-4021-b8a0-0b5a20f8e8c5',  // ether.fi eETH
  cbETH: '90cf7bbb-e28e-440a-aa3d-7d8b0e210679',  // Coinbase cbETH
  rETH: 'cdefcfc4-3182-4e18-9218-01a529375f27',   // Rocket Pool rETH
  ezETH: 'dbfc765c-ad7d-4dc2-8324-af9a5fbeb51a',  // Renzo ezETH
  mETH: '7ba4c037-61ee-4a0e-ae23-527a37189927',   // Mantle mETH
};

// Fallback: fetch from Lido API for wstETH
async function fetchLidoApr(): Promise<number> {
  try {
    const res = await fetch('https://eth-api.lido.fi/v1/protocol/steth/apr/sma');
    if (!res.ok) return 2.5;
    const data = await res.json();
    return data?.data?.smaApr || 2.5;
  } catch {
    return 2.5;
  }
}

interface CachedYields {
  yields: Record<string, number>;
  ts: number;
}

let cachedYields: CachedYields | null = null;

export async function GET() {
  try {
    if (cachedYields && Date.now() - cachedYields.ts < CACHE_TTL) {
      return NextResponse.json({ yields: cachedYields.yields }, {
        headers: { 'Cache-Control': 'public, max-age=120' },
      });
    }

    const yields: Record<string, number> = {};

    // Fetch all pools from DeFiLlama in one call
    const poolIds = Object.values(POOL_MAP);
    const promises = poolIds.map(id =>
      fetch(`https://yields.llama.fi/chart/${id}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    );

    // Also fetch Lido directly as fallback for wstETH
    const [lidoApr, ...poolResults] = await Promise.all([
      fetchLidoApr(),
      ...promises,
    ]);

    // Map pool results back to symbols
    const symbols = Object.keys(POOL_MAP);
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const result = poolResults[i];

      if (result?.data && result.data.length > 0) {
        // Get the latest APY from the chart data
        const latest = result.data[result.data.length - 1];
        yields[symbol] = latest.apy || 0;
      }
    }

    // Use Lido API as primary source for wstETH if DeFiLlama failed
    if (!yields.wstETH || yields.wstETH === 0) {
      yields.wstETH = lidoApr;
    }

    // Reasonable defaults for tokens we couldn't fetch
    const DEFAULTS: Record<string, number> = {
      wstETH: lidoApr,
      weETH: 3.0,
      cbETH: 2.8,
      rETH: 2.7,
      wrsETH: 3.2,
      yoETH: 3.0,
      wsuperOETHb: 4.5,
      bsdETH: 3.0,
      ezETH: 3.1,
      mETH: 3.3,
      pufETH: 3.0,
      osETH: 3.0,
      swETH: 3.2,
      ETHx: 3.1,
      sfrxETH: 3.5,
    };

    // Fill in any missing with defaults
    for (const [sym, def] of Object.entries(DEFAULTS)) {
      if (!yields[sym] || yields[sym] === 0) {
        yields[sym] = def;
      }
    }

    cachedYields = { yields, ts: Date.now() };

    return NextResponse.json({ yields }, {
      headers: { 'Cache-Control': 'public, max-age=120' },
    });
  } catch (err) {
    if (cachedYields) {
      return NextResponse.json({ yields: cachedYields.yields });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
