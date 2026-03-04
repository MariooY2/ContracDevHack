import { loadData } from '@/lib/loadData';
import { enrichMarkets } from '@/lib/dataEnrichment';
import PositionsView from '@/components/pages/PositionsView';

export default async function PositionsPage() {
  const { marketsRaw, ratesRaw, ethAnalysis, stableAnalysis } = await loadData();
  const allMarkets = enrichMarkets(marketsRaw, ratesRaw, ethAnalysis, stableAnalysis);

  return <PositionsView markets={allMarkets} />;
}
