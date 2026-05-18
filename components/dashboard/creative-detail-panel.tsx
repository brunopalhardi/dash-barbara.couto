import { ExternalLink, ImageOff, Target, TrendingUp, ShoppingCart, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "./format";
import { MetricBar } from "./metric-bar";
import { CreativeRadar } from "./creative-radar";
import type { AdDetail } from "@/lib/queries/dashboard";

interface CreativeDetailPanelProps {
  ad: AdDetail;
}

export function CreativeDetailPanel({ ad }: CreativeDetailPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Gasto
          </div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.money(ad.spend)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <Target className="h-3 w-3" /> Leads
          </div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.int(ad.leads)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <ShoppingCart className="h-3 w-3" /> Vendas
          </div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.int(ad.purchases)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Receita
          </div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.money(ad.revenue)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">ROAS</div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.ratio(ad.roas)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CAC</div>
          <div className="text-lg font-bold tabular-nums mt-1">
            {ad.purchases > 0 ? fmt.money(ad.cac) : "—"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-card border-border/60">
          <CardContent className="p-5">
            <div className="aspect-video rounded-md bg-muted/30 mb-4 relative flex items-center justify-center overflow-hidden">
              {ad.thumbnailUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={ad.thumbnailUrl} alt={ad.adName} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="h-8 w-8" />
                  <span className="text-xs">sem thumb</span>
                </div>
              )}
              {ad.previewShareableLink ? (
                <a
                  href={ad.previewShareableLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background/90 border border-border text-xs font-medium hover:bg-background"
                >
                  Ver anúncio <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>

            <h2 className="text-lg font-semibold mb-1">{ad.adName}</h2>
            <p className="text-xs text-muted-foreground mb-4">{ad.campaignName}</p>

            <div className="space-y-3">
              <MetricBar
                label="CTR"
                value={fmt.pct(ad.ctr, 2)}
                percent={Math.min(100, ad.ctr * 10)}
                variant="ctr"
              />
              <MetricBar
                label="Hook Rate"
                value={fmt.pct(ad.hookRate, 1)}
                percent={ad.hookRate}
                variant="hook"
              />
              <MetricBar
                label="Hold Rate"
                value={fmt.pct(ad.holdRate, 1)}
                percent={ad.holdRate}
                variant="hold"
              />
              <MetricBar
                label="Body Rate"
                value={fmt.pct(ad.bodyRate, 1)}
                percent={ad.bodyRate}
                variant="body"
              />
              <MetricBar
                label="CPL"
                value={ad.leads > 0 ? fmt.money(ad.cpl) : "—"}
                percent={Math.min(100, ad.cpl > 0 ? Math.max(5, 100 - ad.cpl * 2) : 0)}
                variant="cpl"
              />
              <MetricBar
                label="Score"
                value={ad.score.toFixed(1)}
                percent={Math.min(100, ad.score)}
                variant="score"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60">
          <CardContent className="p-5">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
              Métricas de vídeo
            </h3>
            <CreativeRadar
              hookRate={ad.hookRate}
              holdRate={ad.holdRate}
              bodyRate={ad.bodyRate}
            />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
              <div>
                <div className="text-muted-foreground">Hook</div>
                <div className="font-semibold tabular-nums">{fmt.pct(ad.hookRate, 1)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Hold</div>
                <div className="font-semibold tabular-nums">{fmt.pct(ad.holdRate, 1)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Body</div>
                <div className="font-semibold tabular-nums">{fmt.pct(ad.bodyRate, 1)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function CreativeDetailEmpty() {
  return (
    <Card className="bg-card border-border/60">
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        Criativo não encontrado no período selecionado.
      </CardContent>
    </Card>
  );
}
