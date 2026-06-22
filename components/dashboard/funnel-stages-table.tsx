import { fmt } from "./format";

interface FunnelStagesProps {
  /** gasto Meta do ingresso (EUR) */
  spend: number;
  /** compradores do ingresso (Desafio) */
  ingressoBuyers: number;
  /** receita Hotmart do ingresso (EUR) */
  ingressoRevenue: number;
  /** compradores que ascenderam ao produto principal */
  ascended: number;
  /** receita EUR do produto principal (dos ascendidos) */
  principalRevenue: number;
}

function divSafe(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

function roasTone(roas: number): string {
  if (roas >= 2) return "text-emerald-400";
  if (roas >= 1) return "text-amber-400";
  if (roas > 0) return "text-rose-400";
  return "text-muted-foreground";
}

/**
 * Funil de 3 linhas do Desafio (pedido do Tiago): mesma verba, mas o ROAS total
 * com o backend (produto principal) recupera o CAC caro do ingresso.
 */
export function FunnelStagesTable({
  spend,
  ingressoBuyers,
  ingressoRevenue,
  ascended,
  principalRevenue,
}: FunnelStagesProps) {
  const totalRevenue = ingressoRevenue + principalRevenue;
  const ingressoRoas = divSafe(ingressoRevenue, spend);
  const totalRoas = divSafe(totalRevenue, spend);
  const principalRoas = divSafe(principalRevenue, spend);
  const cac = divSafe(spend, ingressoBuyers);

  const rows = [
    {
      label: "Total",
      sub: "ingresso + backend",
      accent: "text-foreground font-semibold",
      spend: fmt.money(spend),
      buyers: fmt.int(ingressoBuyers),
      revenue: fmt.money(totalRevenue),
      cac: ingressoBuyers > 0 ? fmt.money(cac) : "—",
      roas: totalRoas,
    },
    {
      label: "Ingresso",
      sub: "venda do ticket",
      accent: "text-muted-foreground",
      spend: fmt.money(spend),
      buyers: fmt.int(ingressoBuyers),
      revenue: fmt.money(ingressoRevenue),
      cac: ingressoBuyers > 0 ? fmt.money(cac) : "—",
      roas: ingressoRoas,
    },
    {
      label: "Produto principal",
      sub: "backend (ascensão)",
      accent: "text-fuchsia-300",
      spend: "—",
      buyers: fmt.int(ascended),
      revenue: fmt.money(principalRevenue),
      cac: "—",
      roas: principalRoas,
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr className="text-left border-b border-border/60">
            <th className="px-3 py-2 font-medium">Etapa</th>
            <th className="px-3 py-2 font-medium text-right">Investido</th>
            <th className="px-3 py-2 font-medium text-right">Compradores</th>
            <th className="px-3 py-2 font-medium text-right">Receita</th>
            <th className="px-3 py-2 font-medium text-right">CAC</th>
            <th className="px-3 py-2 font-medium text-right">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border/40 last:border-0">
              <td className={`px-3 py-2.5 ${r.accent}`}>
                <div>{r.label}</div>
                <div className="text-[10px] text-muted-foreground/70 font-normal">{r.sub}</div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums font-mono">{r.spend}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-mono">{r.buyers}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-mono">{r.revenue}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-mono">{r.cac}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums font-mono font-medium ${roasTone(r.roas)}`}>
                {r.roas > 0 ? fmt.ratio(r.roas) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted-foreground/70 px-3 pt-2">
        Mesma verba do ingresso; o ROAS da linha <span className="text-foreground">Total</span> mostra a
        recuperação via backend. Produto principal não tem gasto próprio (venda de backend).
      </p>
    </div>
  );
}
