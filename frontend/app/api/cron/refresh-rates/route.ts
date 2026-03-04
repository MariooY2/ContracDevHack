import { NextRequest, NextResponse } from 'next/server';
import { refreshAllTokenRates } from '@/lib/refreshTokenRates';
import { supabase } from '@/lib/supabase';

// Token rates needs more time (many RPC calls)
// Vercel Pro: 60s, Enterprise: 300s, Self-hosted: unlimited
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Optional auth: check CRON_SECRET header
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await refreshAllTokenRates();

    // Upsert to Supabase
    const { error } = await supabase
      .from('morpho_data')
      .upsert({
        key: 'token_rates',
        data: result,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json(
        { error: 'Supabase write failed', detail: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      tokenCount: result.rates.length,
      updatedAt: result.timestamp,
    });
  } catch (err) {
    console.error('refresh-rates error:', err);
    return NextResponse.json(
      { error: 'Refresh failed', detail: String(err) },
      { status: 500 },
    );
  }
}
