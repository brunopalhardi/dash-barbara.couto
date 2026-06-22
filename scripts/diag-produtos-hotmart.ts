import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { sql } from "drizzle-orm";

/** Tenta achar o id do produto Hotmart em vários caminhos do payload. */
function productIdFrom(raw: unknown): string | null {
  const p = raw as Record<string, unknown>;
  const data = (p?.data ?? {}) as Record<string, unknown>;
  const prod = (data?.product ?? p?.product ?? {}) as Record<string, unknown>;
  const id = prod?.id ?? prod?.ucode ?? (p as Record<string, unknown>)?.prod;
  return id != null ? String(id) : null;
}

(async () => {
  const rows = await db
    .select({
      name: purchases.productNameRaw,
      slug: purchases.productSlug,
      currency: purchases.currency,
      n: sql<number>`count(*)::int`,
      approved: sql<number>`count(*) filter (where ${purchases.status} = 'approved')::int`,
      totalCents: sql<number>`coalesce(sum(${purchases.valueCents}) filter (where ${purchases.status} = 'approved'), 0)::bigint`,
      firstAt: sql<string>`min(${purchases.purchasedAt})`,
      lastAt: sql<string>`max(${purchases.purchasedAt})`,
      sampleRaw: sql<unknown>`(array_agg(${purchases.rawPayload}))[1]`,
    })
    .from(purchases)
    .groupBy(purchases.productNameRaw, purchases.productSlug, purchases.currency)
    .orderBy(sql`count(*) filter (where ${purchases.status} = 'approved') desc`);

  // Consolida por ID Hotmart (mescla variações de nome / split de moeda).
  type Agg = {
    id: string; name: string; slug: string;
    approved: number; cents: number; currencies: Set<string>;
    first: string; last: string;
  };
  const byId = new Map<string, Agg>();
  for (const r of rows) {
    const id = productIdFrom(r.sampleRaw) ?? `?nome:${r.name}`;
    const cur = byId.get(id);
    if (!cur) {
      byId.set(id, {
        id, name: r.name ?? "(sem nome)", slug: r.slug,
        approved: Number(r.approved), cents: Number(r.totalCents),
        currencies: new Set(r.currency ? [r.currency] : []),
        first: String(r.firstAt).slice(0, 10), last: String(r.lastAt).slice(0, 10),
      });
    } else {
      cur.approved += Number(r.approved);
      cur.cents += Number(r.totalCents);
      if (r.currency) cur.currencies.add(r.currency);
      if (String(r.firstAt).slice(0, 10) < cur.first) cur.first = String(r.firstAt).slice(0, 10);
      if (String(r.lastAt).slice(0, 10) > cur.last) cur.last = String(r.lastAt).slice(0, 10);
    }
  }
  const list = [...byId.values()].sort((a, b) => b.cents - a.cents);

  console.log(`\n=== Produtos Hotmart distintos (${list.length}) — ordenado por faturamento aprovado ===\n`);
  for (const p of list) {
    const total = (p.cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const flag = p.slug === "desafio" ? "  ◀ INGRESSO (slug=desafio)" : "";
    console.log(`• ${total} ${[...p.currencies].join("/")}  ·  ${p.approved} vendas  ·  ID ${p.id}${flag}`);
    console.log(`    "${p.name}"   [${p.first} → ${p.last}]\n`);
  }
  process.exit(0);
})();
