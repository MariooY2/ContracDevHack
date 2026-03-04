import { NextRequest, NextResponse } from 'next/server';
import { refreshAllMarkets } from '@/lib/refreshMarkets';
import { supabase } from '@/lib/supabase';

// Allow up to 60s for serverless (Vercel Pro) or unlimited on self-hosted
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Optional auth: check CRON_SECRET header
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, summary } = await refreshAllMarkets();

    // Upsert to Supabase
    const { error } = await supabase
      .from('morpho_data')
      .upsert({
        key: 'markets_all_chains',
        data,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json(
        { error: 'Supabase write failed', detail: error.message },
        { status: 500 },
      );
    }

    const totalMarkets = summary.reduce((s, c) => s + c.count, 0);

    return NextResponse.json({
      ok: true,
      totalMarkets,
      chains: summary,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('refresh-markets error:', err);
    return NextResponse.json(
      { error: 'Refresh failed', detail: String(err) },
      { status: 500 },
    );
  }
}
