import { NextResponse } from 'next/server';
import { ORACLE_MAP } from '@/lib/oracleMap';
import { syncAllOracles } from '@/lib/oracleSync';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // Verify authorization (Vercel cron sends this header automatically)
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    const configs = Object.values(ORACLE_MAP);
    console.log(`[cron] Starting oracle sync for ${configs.length} oracles...`);

    // Incremental RPC sync — fetches new logs since last_synced_block
    const result = await syncAllOracles(configs);

    const durationMs = Date.now() - start;
    console.log(`[cron] Oracle sync complete: ${result.synced} synced, ${result.errors.length} errors, ${durationMs}ms`);

    return NextResponse.json({
      synced: result.synced,
      errors: result.errors,
      durationMs,
      results: result.results.map(r => ({
        pair: r.pair,
        points: r.pointCount,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[cron] Oracle sync failed:`, message);
    return NextResponse.json({ error: message, durationMs: Date.now() - start }, { status: 500 });
  }
}

export const maxDuration = 60;
