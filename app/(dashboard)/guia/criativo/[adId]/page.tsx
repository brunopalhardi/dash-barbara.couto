import { notFound } from "next/navigation";
import { getAdDetail, getTopAds, rangeCurrentCycle } from "@/lib/queries/dashboard";
import { CreativeList } from "@/components/dashboard/creative-list";
import { CreativeDetailEmpty, CreativeDetailPanel } from "@/components/dashboard/creative-detail-panel";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

const DEFAULT_CYCLE = 30;

function parseCycle(sp: { cycle?: string; start?: string; end?: string }) {
  const custom =
    sp.start && sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) && /^\d{4}-\d{2}-\d{2}$/.test(sp.end)
      ? { start: sp.start, end: sp.end }
      : undefined;
  if (custom) {
    const days = Math.round(
      (new Date(custom.end + "T00:00:00").getTime() -
        new Date(custom.start + "T00:00:00").getTime()) / 86_400_000,
    ) + 1;
    return { cycleDays: Math.max(1, days), custom };
  }
  const n = Number(sp.cycle ?? DEFAULT_CYCLE);
  return { cycleDays: Number.isFinite(n) && n > 0 ? n : DEFAULT_CYCLE, custom: undefined };
}

export default async function GuiaCreativeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ adId: string }>;
  searchParams: Promise<{ cycle?: string; start?: string; end?: string }>;
}) {
  const { adId: adIdRaw } = await params;
  const adId = Number(adIdRaw);
  if (!Number.isFinite(adId)) notFound();

  const sp = await searchParams;
  const { cycleDays, custom } = parseCycle(sp);
  const range = rangeCurrentCycle(cycleDays, custom);

  const [detail, ranking] = await Promise.all([
    getAdDetail(adId, range),
    getTopAds("guia", range, { limit: 100, orderBy: "spend" }),
  ]);

  return (
    <>
      <PageHeader
        title="Análise de criativos"
        subtitle="Guia · clique nos criativos pra comparar métricas"
        hidePicker
      />
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <CreativeList ads={ranking} basePath="/guia/criativo" activeAdId={adId} />
        {detail ? <CreativeDetailPanel ad={detail} /> : <CreativeDetailEmpty />}
      </div>
    </>
  );
}
