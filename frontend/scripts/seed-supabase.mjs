/**
 * Seed Supabase morpho_data table from existing JSON files.
 * Run: node scripts/seed-supabase.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');

const supabase = createClient(
  'https://kcagsgqypafcwkzjhxng.supabase.co',
  'sb_publishable_25QpvOa-NF6xY9Z_L4TmMQ_P8p6mXnO'
);

async function seed() {
  console.log('Seeding Supabase morpho_data table...\n');

  const files = [
    { key: 'markets_all_chains', file: 'morpho_markets_all_chains.json' },
    { key: 'token_rates', file: 'token_rates_onchain.json' },
    { key: 'eth_pairs_analysis', file: 'eth_pairs_analysis.json' },
    { key: 'stable_pairs_analysis', file: 'stable_pairs_analysis.json' },
  ];

  for (const { key, file } of files) {
    try {
      const content = await readFile(join(DATA_DIR, file), 'utf-8');
      const data = JSON.parse(content);

      const { error } = await supabase
        .from('morpho_data')
        .upsert({
          key,
          data,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error(`  ✗ ${key}: ${error.message}`);
      } else {
        console.log(`  ✓ ${key} (${file})`);
      }
    } catch (err) {
      console.error(`  ✗ ${key}: ${err.message}`);
    }
  }

  // Verify
  console.log('\nVerifying...');
  const { data, error } = await supabase
    .from('morpho_data')
    .select('key, updated_at');

  if (error) {
    console.error('  Verify failed:', error.message);
  } else {
    for (const row of data) {
      console.log(`  ✓ ${row.key} — updated ${row.updated_at}`);
    }
  }

  console.log('\nDone!');
}

seed();
