import { ArrowUpRight, ExternalLink } from "lucide-react";
import { fmt } from "./format";
import type { AscensionStats } from "@/lib/queries/purchases";

const PRINCIPAL_LABEL: Record<string, string> = {
  principal_base: "Base",
  principal_prof: "Profissional",
};

function principalTone(slug: string): string {
  return slug === "principal_prof"
    ? "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30"
    : "text-sky-300 bg-sky-500/10 border-sky-500/30";
}

export function AscensionPanel({ data }: { data: AscensionStats }) {
  const {
    desafioBuyers, settledBuyers, maturingBuyers, ascended, ascendedSettled,
    ascendedBase, ascendedProf, rate, principalRevenueEur, windowDays, rows,
  } = data;
  const maturingAscended = ascended - ascendedSettled;

  if (desafioBuyers === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem compradores do Desafio no período.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="md:col-span-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            Taxa de ascensão
          </div>
          <div className="font-mono font-semibold tabular-nums text-4xl leading-none tracking-tight mt-1.5 text-fuchsia-300">
            {settledBuyers > 0 ? fmt.pct1(rate * 100) : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1.5">
            {fmt.int(ascendedSettled)} de {fmt.int(settledBuyers)} maduros · janela {windowDays}d
          </div>
          {maturingBuyers > 0 && (
            <div className="text-[11px] text-amber-400/90 mt-1">
              {fmt.int(maturingBuyers)} ainda na janela
              {maturingAscended > 0 ? ` (${fmt.int(maturingAscended)} já subiram)` : ""}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            Ascenderam · Base
          </div>
          <div className="font-mono font-medium tabular-nums text-2xl leading-none mt-1.5 text-sky-300">
            {fmt.int(ascendedBase)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            Ascenderam · Profissional
          </div>
          <div className="font-mono font-medium tabular-nums text-2xl leading-none mt-1.5 text-fuchsia-300">
            {fmt.int(ascendedProf)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            Receita do principal
          </div>
          <div className="font-mono font-medium tabular-nums text-2xl leading-none mt-1.5">
            {fmt.money(principalRevenueEur)}
          </div>
        </div>
      </div>

      {/* Lista dos que ascenderam */}
      {rows.length > 0 && (
        <div className="rounded-md border border-border/60 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Comprador</th>
                <th className="px-3 py-2 font-medium">Ingresso</th>
                <th className="px-3 py-2 font-medium">Produto principal</th>
                <th className="px-3 py-2 font-medium text-right">Valor principal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.buyerEmail ?? r.buyerPhoneE164 ?? i}`} className="border-t border-border/40">
                  <td className="px-3 py-2">
                    <div className="font-medium truncate max-w-[200px]" title={r.buyerName ?? ""}>
                      {r.buyerName ?? "—"}
                    </div>
                    {r.buyerPhoneE164 && (
                      <a
                        href={`https://wa.me/${r.buyerPhoneE164}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-0.5"
                      >
                        {r.buyerPhoneE164}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {fmt.shortDate(r.desafioAt.toISOString().slice(0, 10))}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3 text-fuchsia-400" />
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${principalTone(r.principalSlug)}`}
                      >
                        {PRINCIPAL_LABEL[r.principalSlug] ?? r.principalSlug}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {fmt.shortDate(r.principalAt.toISOString().slice(0, 10))}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono">
                    {fmt.money(r.principalValueEur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
