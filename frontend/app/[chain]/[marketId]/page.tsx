import { notFound } from 'next/navigation';
import { loadData } from '@/lib/loadData';
import { enrichMarkets } from '@/lib/dataEnrichment';
import { isValidChainSlug } from '@/lib/chains';
import MarketDetailView from '@/components/pages/MarketDetailView';

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ chain: string; marketId: string }>;
}) {
  const { chain, marketId } = await params;

  if (!isValidChainSlug(chain)) {
    notFound();
  }

  const { marketsRaw, ratesRaw, ethAnalysis, stableAnalysis } = await loadData();
  const allMarkets = enrichMarkets(marketsRaw, ratesRaw, ethAnalysis, stableAnalysis);

  const market = allMarkets.find(m => m.chainSlug === chain && m.marketId === marketId);

  if (!market) {
    notFound();
  }

  return <MarketDetailView market={market} chainSlug={chain} />;
}
