/**
 * Centralized data loader for server components.
 * Reads ALL data from Supabase, falls back to static JSON files only if Supabase is unavailable.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { supabase } from './supabase';
import type { RawMarket, RawTokenRate, RawLeverageAnalysis } from './types';

export interface RawDataBundle {
  marketsRaw: Record<string, RawMarket[]>;
  ratesRaw: { rates: RawTokenRate[] };
  ethAnalysis: Record<string, RawLeverageAnalysis[]>;
  stableAnalysis: Record<string, RawLeverageAnalysis[]>;
}

const DATA_DIR = join(process.cwd(), 'public', 'data');

/**
 * Load all 4 data sources from Supabase.
 * Falls back to static JSON files only if Supabase is unavailable.
 */
export async function loadData(): Promise<RawDataBundle> {
  const [marketsRaw, ratesRaw, ethAnalysis, stableAnalysis] = await Promise.all([
    loadFromSupabase('markets_all_chains', 'morpho_markets_all_chains.json'),
    loadFromSupabase('token_rates', 'token_rates_onchain.json'),
    loadFromSupabase('eth_pairs_analysis', 'eth_pairs_analysis.json'),
    loadFromSupabase('stable_pairs_analysis', 'stable_pairs_analysis.json'),
  ]);

  return {
    marketsRaw: marketsRaw as Record<string, RawMarket[]>,
    ratesRaw: ratesRaw as { rates: RawTokenRate[] },
    ethAnalysis: ethAnalysis as Record<string, RawLeverageAnalysis[]>,
    stableAnalysis: stableAnalysis as Record<string, RawLeverageAnalysis[]>,
  };
}

async function loadFromSupabase(key: string, fallbackFile: string): Promise<unknown> {
  try {
    const { data, error } = await supabase
      .from('morpho_data')
      .select('data')
      .eq('key', key)
      .single();

    if (!error && data?.data) {
      return data.data;
    }
  } catch {
    // Supabase unavailable, fall through to JSON
  }

  return readJsonFile(fallbackFile);
}

async function readJsonFile(filename: string): Promise<unknown> {
  const content = await readFile(join(DATA_DIR, filename), 'utf-8');
  return JSON.parse(content);
}
