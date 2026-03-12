import { NextResponse } from 'next/server';
import { DuneClient } from '@duneanalytics/client-sdk';
import { supabase } from '../../../lib/supabase';

const DUNE_QUERY_ID = 6791272;

/**
 * GET /api/oracle-seed
 *
 * Fetches all AnswerUpdated oracle data from Dune Analytics
 * and upserts it into Supabase oracle_rounds table.
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
    // Dune columns: round_id (string), redemption_rate (float), timestamp (date string), block_number
    const oracleRows = rows.map((row: Record<string, unknown>) => ({
      round_id: Number(row.round_id),
      rate: Number(row.redemption_rate),
      timestamp: Math.floor(new Date(row.timestamp as string).getTime() / 1000),
      block: Number(row.block_number),
      tx_hash: String(row.tx_hash ?? ''),
    }));

    // Upsert in batches of 500
    let totalInserted = 0;
    for (let i = 0; i < oracleRows.length; i += 500) {
      const batch = oracleRows.slice(i, i + 500);
      const { error } = await supabase
        .from('oracle_rounds')
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
      sampleRow: rows[0], // return first row so we can verify field mapping
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
