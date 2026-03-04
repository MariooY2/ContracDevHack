import { loadData } from '@/lib/loadData';
import { enrichMarkets, buildChainSummaries } from '@/lib/dataEnrichment';
import HomeView from '@/components/pages/HomeView';

export default async function HomePage() {
  const { marketsRaw, ratesRaw, ethAnalysis, stableAnalysis } = await loadData();
  const allMarkets = enrichMarkets(marketsRaw, ratesRaw, ethAnalysis, stableAnalysis);
  const chainSummaries = buildChainSummaries(allMarkets);

  // Top 10 markets sorted by aggressive ROE
  const topMarkets = [...allMarkets]
    .sort((a, b) => b.roe.aggressive.roe - a.roe.aggressive.roe)
    .slice(0, 10);

  return (
    <HomeView
      chains={chainSummaries}
      totalMarkets={allMarkets.length}
      topMarkets={topMarkets}
    />
  );
}
