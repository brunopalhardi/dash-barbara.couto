import { TrendingUp, ShoppingCart, DollarSign, Target, Activity, Users } from "lucide-react";
import {
  getCampaignBreakdown,
  getDailySeries,
  getKpis,
  getTopAds,
  rangePreviousCycle,
} from "@/lib/queries/dashboard";
import { parseRangeFromSearchParams } from "@/lib/utils/date-ranges";
import {
  getApprovedPurchaseCount,
  getApprovedPurchaseRevenue,
  getAscensionToPrincipal,
  getBuyersForCycle,
  getDailyPurchaseSeries,
  getInGroupStats,
  getRevenueSplit,
} from "@/lib/queries/purchases";
import { getSendflowGroupSummary } from "@/lib/queries/sendflow";
import { getPageFunnel } from "@/lib/queries/funnel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BuyersTable } from "@/components/dashboard/buyers-table";
import { ComparisonToggle } from "@/components/dashboard/comparison-toggle";
import { RefreshTodayButton } from "@/components/dashboard/refresh-today-button";
import { DailyBarChart, type DailyBarPoint } from "@/components/dashboard/daily-bar-chart";
import { fmt } from "@/components/dashboard/format";
import { SendflowGroupPanel } from "@/components/dashboard/sendflow-group-panel";
import { AscensionPanel } from "@/components/dashboard/ascension-panel";
import { FunnelStagesTable } from "@/components/dashboard/funnel-stages-table";
import { CollapsibleCard } from "@/components/dashboard/collapsible-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { TopCreativesToggle } from "@/components/dashboard/top-creatives-toggle";
import { FunnelHighlights, highlightsByCpa } from "@/components/dashboard/funnel-highlights";
import { FunnelTablePage } from "@/components/dashboard/funnel-table-page";
import { CampaignTable } from "@/components/dashboard/campaign-table";
import type { DateRange, DailyPoint } from "@/lib/queries/dashboard";
import type { DailyPurchasePoint } from "@/lib/queries/purchases";

export const dynamic = "force-dynamic";


function buildDailyPoints(
  range: DateRange,
  hotmart: DailyPurchasePoint[],
  meta: DailyPoint[],
): DailyBarPoint[] {
  const out: DailyBarPoint[] = [];
  const start = new Date(range.from + "T12:00:00");
  const end = new Date(range.to + "T12:00:00");
  const cur = new Date(start);
  const hotmartMap = new Map(hotmart.map((d) => [d.date, d]));
  const metaMap = new Map(meta.map((d) => [d.date, d]));
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const h = hotmartMap.get(iso);
    const m = metaMap.get(iso);
    const vendas = h?.count ?? 0;
    const receita = h ? h.revenueCents / 100 : 0;
    const investido = m?.spend ?? 0;
    const roas = investido > 0 ? receita / investido : 0;
    out.push({ date: iso, vendas, receita, investido, roas });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function deltaOf(curr: number, prev: number): { label: string; positive: boolean } | null {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return { label: "+∞", positive: curr > 0 };
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { label: `${sign}${pct.toFixed(1)}%`, positive: pct >= 0 };
}

export default async function DesafioPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; cycle?: string; start?: string; end?: string; compare?: string; hoje?: string }>;
}) {
  const sp = await searchParams;
  const { range: currentRange, label: rangeLabel, includeToday } = parseRangeFromSearchParams(sp);
  const compare = sp.compare === "1";
  const prevRange = rangePreviousCycle(currentRange);

  const [
    kpis, adsTbl, sendflowSummary,
    purchaseCount, revenueHot, inGroup, dailyHot, dailyMeta,
    prevKpis, prevPurchaseCount, prevRevenueHot, prevDailyHot, prevDailyMeta,
    buyers,
    split,
    campaignBreakdown,
    pageFunnel,
    ascension,
  ] = await Promise.all([
    getKpis("desafio", currentRange),
    // Pool amplo de ativos pra reordenar no client (vendas/gasto/ROAS/CTR).
    getTopAds("desafio", currentRange, { limit: 30, orderBy: "spend", onlyActive: true }),
    getSendflowGroupSummary(currentRange),
    getApprovedPurchaseCount("desafio", currentRange),
    getApprovedPurchaseRevenue("desafio", currentRange),
    getInGroupStats("desafio", currentRange),
    getDailyPurchaseSeries("desafio", currentRange),
    getDailySeries("desafio", currentRange),
    compare ? getKpis("desafio", prevRange) : Promise.resolve(null),
    compare ? getApprovedPurchaseCount("desafio", prevRange) : Promise.resolve(0),
    compare ? getApprovedPurchaseRevenue("desafio", prevRange) : Promise.resolve(0),
    compare ? getDailyPurchaseSeries("desafio", prevRange) : Promise.resolve([]),
    compare ? getDailySeries("desafio", prevRange) : Promise.resolve([]),
    getBuyersForCycle("desafio", currentRange),
    getRevenueSplit("desafio", currentRange),
    getCampaignBreakdown("desafio", currentRange),
    getPageFunnel("desafio", currentRange),
    getAscensionToPrincipal(currentRange),
  ]);

  const currentDaily = buildDailyPoints(currentRange, dailyHot, dailyMeta);
  const prevDaily = compare ? buildDailyPoints(prevRange, prevDailyHot, prevDailyMeta) : null;

  const cac = purchaseCount > 0 ? kpis.spend / purchaseCount : 0;
  const roas = kpis.spend > 0 ? revenueHot / kpis.spend : 0;
  const inGroupPct = inGroup.buyersWithPhone > 0
    ? (inGroup.inGroup / inGroup.buyersWithPhone) * 100
    : 0;

  const prevCac = compare && prevPurchaseCount > 0 && prevKpis ? prevKpis.spend / prevPurchaseCount : 0;
  const prevRoas = compare && prevKpis && prevKpis.spend > 0 ? prevRevenueHot / prevKpis.spend : 0;

  const subtitle = `${rangeLabel} · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)}${includeToday ? " · hoje parcial" : " · dados até ontem"}`;

  return (
    <>
      <PageHeader
        title="Desafio"
        subtitle={subtitle}
        hidePicker
        right={
          <div className="flex items-center gap-2">
            <RefreshTodayButton />
            <ComparisonToggle />
            <PeriodSelector />
          </div>
        }
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard
          label="Investido"
          value={fmt.money(kpis.spend)}
          delta={compare && prevKpis ? deltaOf(kpis.spend, prevKpis.spend) : null}
          invertDelta
          icon={DollarSign}
          accent="violet"
        />
        <KpiCard
          label="Compradores"
          value={fmt.int(purchaseCount)}
          delta={compare ? deltaOf(purchaseCount, prevPurchaseCount) : null}
          icon={ShoppingCart}
          accent="emerald"
        />
        <KpiCard
          label="Receita"
          value={fmt.money(revenueHot)}
          hint={`tráfego ${fmt.money(split.trafego)} · org ${fmt.money(split.organico)} · s/atrib ${fmt.money(split.semAtribuicao)}${purchaseCount > 0 ? ` · TM ${fmt.money(revenueHot / purchaseCount)}` : ""}`}
          delta={compare ? deltaOf(revenueHot, prevRevenueHot) : null}
          icon={TrendingUp}
          accent="emerald"
        />
        <KpiCard
          label="CAC"
          value={purchaseCount > 0 ? fmt.money(cac) : "—"}
          delta={compare && prevCac > 0 ? deltaOf(cac, prevCac) : null}
          invertDelta
          icon={Target}
          accent="amber"
        />
        <KpiCard
          label="ROAS"
          value={fmt.ratio(roas)}
          hint="alvo 2x"
          delta={compare && prevRoas > 0 ? deltaOf(roas, prevRoas) : null}
          icon={Activity}
          accent="sky"
        />
        <KpiCard
          label="No grupo"
          value={`${inGroupPct.toFixed(0)}%`}
          hint={`${inGroup.inGroup} de ${inGroup.buyersWithPhone}`}
          icon={Users}
          accent="fuchsia"
        />
      </section>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Funil do Desafio · 3 etapas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelStagesTable
            spend={kpis.spend}
            ingressoBuyers={purchaseCount}
            ingressoRevenue={revenueHot}
            ascended={ascension.ascended}
            principalRevenue={ascension.principalRevenueEur}
          />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ascensão · Desafio → Produto principal
          </CardTitle>
          <p className="text-xs text-muted-foreground/70">
            Compradores do ingresso que compraram o produto principal depois (oferta durante os 7 dias).
          </p>
        </CardHeader>
        <CardContent>
          <AscensionPanel data={ascension} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Performance diária
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DailyBarChart current={currentDaily} previous={prevDaily} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Top criativos · top 5 (selecione a métrica)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TopCreativesToggle ads={adsTbl} limit={5} basePath="/desafio/criativo" />
        </CardContent>
      </Card>

      <CollapsibleCard title="Campanhas · gasto do período">
        <CampaignTable data={campaignBreakdown} />
      </CollapsibleCard>

      <CollapsibleCard title="Performance de página · destino dos anúncios" defaultOpen>
        <FunnelHighlights
          items={highlightsByCpa(
            pageFunnel.map((p) => ({
              label: p.landingUrl ?? "Sem URL",
              spend: p.spend,
              purchase: p.purchase,
            })),
          )}
        />
        <FunnelTablePage rows={pageFunnel} />
      </CollapsibleCard>

      <CollapsibleCard title={`Compradores do período · ${buyers.length}`}>
        <BuyersTable buyers={buyers} showInGroup />
      </CollapsibleCard>

      <CollapsibleCard title="Grupos WhatsApp — SendFlow">
        <SendflowGroupPanel data={sendflowSummary} />
      </CollapsibleCard>
    </>
  );
}
