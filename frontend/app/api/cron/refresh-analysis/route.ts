import { NextRequest, NextResponse } from 'next/server';
import { refreshAllAnalysis } from '@/lib/refreshAnalysis';
import { supabase } from '@/lib/supabase';

// Many RPC calls (180 days × N oracles) — give it plenty of time
export const maxDuration = 600;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ethAnalysis, stableAnalysis, depegRows, summary } = await refreshAllAnalysis();

    const now = new Date().toISOString();

    // 1. Upsert summary stats to morpho_data (no price_history in blob)
    const [ethRes, stableRes] = await Promise.all([
      supabase.from('morpho_data').upsert({
        key: 'eth_pairs_analysis',
        data: ethAnalysis,
        updated_at: now,
      }),
      supabase.from('morpho_data').upsert({
        key: 'stable_pairs_analysis',
        data: stableAnalysis,
        updated_at: now,
      }),
    ]);

    if (ethRes.error || stableRes.error) {
      const detail = ethRes.error?.message || stableRes.error?.message;
      console.error('Supabase morpho_data upsert error:', detail);
      return NextResponse.json(
        { error: 'Supabase morpho_data write failed', detail },
        { status: 500 },
      );
    }

    // 2. Bulk upsert price history to oracle_depeg_history table
    //    Chunk into batches of 500 rows for Supabase limits
    let depegWriteErrors = 0;
    for (let i = 0; i < depegRows.length; i += 500) {
      const chunk = depegRows.slice(i, i + 500);
      const { error } = await supabase
        .from('oracle_depeg_history')
        .upsert(chunk, { onConflict: 'market_id,timestamp_ms' });
      if (error) {
        console.error(`Depeg history chunk ${i} error:`, error.message);
        depegWriteErrors++;
      }
    }

    const totalPairs = summary.reduce((s, c) => s + c.ethPairs + c.stablePairs, 0);

    return NextResponse.json({
      ok: true,
      totalPairs,
      depegPoints: depegRows.length,
      depegWriteErrors,
      chains: summary,
      updatedAt: now,
    });
  } catch (err) {
    console.error('refresh-analysis error:', err);
    return NextResponse.json(
      { error: 'Refresh failed', detail: String(err) },
      { status: 500 },
    );
  }
}
