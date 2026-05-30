import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import type { AdRow } from "@/lib/queries/dashboard";

interface TopCreativesGridProps {
  /** Já vem ordenado por CPA crescente, só ativos e com venda — vide getTopAds */
  ads: AdRow[];
  limit?: number;
  /** Base href pra rota de detalhe (ex.: "/desafio/criativo"). Sem trailing slash. */
  basePath: string;
}

function cpaColor(cpa: number): string {
  // Alvo prático: CAC ≤ R$150 no infoproduto do Bruno
  if (cpa > 0 && cpa <= 150) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (cpa > 0 && cpa <= 250) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-rose-400 bg-rose-500/10 border-rose-500/30";
}

export function TopCreativesGrid({ ads, limit = 5, basePath }: TopCreativesGridProps) {
  const top = ads.slice(0, limit);

  if (top.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem criativos ativos com venda no período.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {top.map((ad) => {
        const roas = ad.spend > 0 ? ad.revenue / ad.spend : 0;
        return (
          <Link
            key={ad.adId}
            href={`${basePath}/${ad.adId}`}
            title="Ver análise detalhada"
            className="rounded-lg border border-border/60 bg-card overflow-hidden flex flex-col hover:border-primary/40 transition-colors group"
          >
            <div className="aspect-square bg-muted/30 relative flex items-center justify-center">
              {ad.thumbnailUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={ad.thumbnailUrl}
                  alt={ad.adName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">sem thumb</span>
              )}
              <span
                className={cn(
                  "absolute top-2 right-2 px-1.5 py-0.5 text-[10px] rounded border font-semibold tabular-nums",
                  cpaColor(ad.cpa),
                )}
                title="Custo por venda no período"
              >
                {fmt.money(ad.cpa)}
              </span>
              <ExternalLink className="absolute top-2 left-2 h-3.5 w-3.5 text-foreground/0 group-hover:text-foreground/80 transition-colors" />
            </div>
            <div className="p-2.5 flex-1 flex flex-col gap-1">
              <div className="text-xs font-medium truncate" title={ad.adName}>
                {ad.adName}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums flex justify-between">
                <span>{fmt.int(ad.purchases)} vendas</span>
                <span>ROAS {fmt.ratio(roas)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums flex justify-between">
                <span>{fmt.money(ad.spend)} gasto</span>
                <span>{fmt.int(ad.leads)} leads</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
