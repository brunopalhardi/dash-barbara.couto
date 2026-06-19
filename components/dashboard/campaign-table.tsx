import { AlertTriangle } from "lucide-react";
import { fmt } from "./format";
import type { CampaignBreakdown } from "@/lib/queries/dashboard";

/**
 * Tabela de campanhas do produto com gasto COMPLETO (inclui pausados/stub, então
 * o total reconcilia com o KPI Investido). Campanha que gastou sem nenhum
 * criativo ativo recebe ⚠ — dinheiro saindo sem criativo rastreável rodando,
 * pra o time auditar o gestor de tráfego.
 */
export function CampaignTable({ data }: { data: CampaignBreakdown }) {
  const { rows, total } = data;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem campanhas com gasto no período.
      </p>
    );
  }

  const attentionCount = rows.filter((r) => r.needsAttention).length;

  return (
    <div className="space-y-3">
      {attentionCount > 0 && (
        <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" />
          {attentionCount} {attentionCount === 1 ? "campanha gastou" : "campanhas gastaram"} sem
          criativo ativo — conferir com o gestor.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b border-border/60">
              <th className="text-left font-medium py-2 pr-4">Campanha</th>
              <th className="text-right font-medium py-2 px-4">Gasto</th>
              <th className="text-right font-medium py-2 px-4">%</th>
              <th className="text-right font-medium py-2 px-4">Criativos no período</th>
              <th className="text-right font-medium py-2 pl-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.campaignId}
                className={`border-b border-border/40 ${r.needsAttention ? "bg-amber-400/[0.04]" : ""}`}
              >
                <td className="py-2.5 pr-4 max-w-[280px]">
                  <span className="truncate block text-foreground" title={r.name}>
                    {r.name}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                  {fmt.money(r.spend)}
                </td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-muted-foreground">
                  {fmt.pct(r.pctOfTotal * 100, 0)}
                </td>
                <td
                  className={`py-2.5 px-4 text-right font-mono tabular-nums ${
                    r.needsAttention ? "text-amber-400" : ""
                  }`}
                >
                  {fmt.int(r.creativesWithSpend)}
                </td>
                <td className="py-2.5 pl-4 text-right">
                  {r.needsAttention ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      sem criativo
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      ok
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-xs">
              <td className="py-2.5 pr-4 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                Total (= Investido)
              </td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium">
                {fmt.money(total)}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
