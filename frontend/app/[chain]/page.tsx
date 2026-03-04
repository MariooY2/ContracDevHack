import { notFound } from 'next/navigation';
import { loadData } from '@/lib/loadData';
import { enrichMarkets, getMarketsForChain } from '@/lib/dataEnrichment';
import { isValidChainSlug } from '@/lib/chains';
import ChainMarketsView from '@/components/pages/ChainMarketsView';

export default async function ChainPage({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;

  if (!isValidChainSlug(chain)) {
    notFound();
  }

  const { marketsRaw, ratesRaw, ethAnalysis, stableAnalysis } = await loadData();
  const allMarkets = enrichMarkets(marketsRaw, ratesRaw, ethAnalysis, stableAnalysis);
  const chainMarkets = getMarketsForChain(allMarkets, chain);

  return <ChainMarketsView chain={chain} markets={chainMarkets} />;
}
