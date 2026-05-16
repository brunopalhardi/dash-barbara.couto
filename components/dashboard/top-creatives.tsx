import Image from "next/image";
import { fmt } from "./format";
import type { HierarchyRow } from "@/lib/queries/dashboard";

interface Props {
  ads: HierarchyRow[];
  limit?: number;
}

export function TopCreatives({ ads, limit = 5 }: Props) {
  const top = [...ads].sort((a, b) => b.spend - a.spend).slice(0, limit);

  if (top.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem anúncios com gasto no período.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {top.map((a) => (
        <div
          key={a.id}
          className="rounded-lg overflow-hidden border border-border/60 bg-card/40"
        >
          <div className="relative aspect-square bg-muted">
            {a.thumbnailUrl ? (
              <Image
                src={a.thumbnailUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 20vw, 50vw"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-muted-foreground text-xs">
                sem thumb
              </div>
            )}
            <div className="absolute bottom-1 right-1 bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-semibold tabular-nums">
              {fmt.money(a.spend)}
            </div>
          </div>
          <div className="p-2.5 space-y-1">
            <p className="text-[11px] text-foreground line-clamp-2 leading-tight">{a.name}</p>
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>{fmt.int(a.purchases)} vendas</span>
              <span className={a.roas >= 1 ? "text-emerald-400" : "text-amber-400"}>
                {fmt.ratio(a.roas)}x
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
