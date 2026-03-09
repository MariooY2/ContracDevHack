import { NextResponse } from 'next/server';
import { DuneClient } from '@duneanalytics/client-sdk';
import { supabase } from '@/lib/supabase';

const DUNE_QUERY_ID = 6797086;

/**
 * GET /api/steth-seed
 *
 * Fetches stETH/ETH AnswerUpdated data from Dune Analytics
 * and upserts into Supabase steth_depeg_rounds table.
 */
export async function GET() {
  try {
    const duneApiKey = process.env.DUNE_API_KEY;
    if (!duneApiKey) {
      return NextResponse.json({ error: 'DUNE_API_KEY not set' }, { status: 500 });
    }

    const dune = new DuneClient(duneApiKey);
    const queryResult = await dune.getLatestResult({ queryId: DUNE_QUERY_ID });

    const rows = queryResult?.result?.rows;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No data from Dune query' }, { status: 404 });
    }

    // Map Dune rows to our schema
    // Columns from query: timestamp, block_number, steth_eth_price, round_id
    const dbRows = rows.map((row: Record<string, unknown>) => ({
      round_id: Number(row.round_id),
      price: Number(row.steth_eth_price),
      timestamp: Math.floor(new Date(row.timestamp as string).getTime() / 1000),
      block: Number(row.block_number),
    }));

    // Upsert in batches of 500
    let totalInserted = 0;
    for (let i = 0; i < dbRows.length; i += 500) {
      const batch = dbRows.slice(i, i + 500);
      const { error } = await supabase
        .from('steth_depeg_rounds')
        .upsert(batch, { onConflict: 'round_id' });

      if (error) {
        console.error('Supabase batch error:', error.message);
      } else {
        totalInserted += batch.length;
      }
    }

    return NextResponse.json({
      success: true,
      duneRows: rows.length,
      inserted: totalInserted,
      sampleRow: rows[0],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
