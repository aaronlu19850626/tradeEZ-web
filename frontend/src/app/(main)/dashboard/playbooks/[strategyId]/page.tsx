import { StrategyDetailPage } from "../_components/strategy-detail-page";

export default async function Page({ params }: { params: Promise<{ strategyId: string }> }) {
  const { strategyId } = await params;
  return <StrategyDetailPage strategyId={strategyId} />;
}
