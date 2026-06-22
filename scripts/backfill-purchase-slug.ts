/**
 * Reclassifica purchases.product_slug rodando classifyPurchaseProduct sobre o
 * id do produto (do raw_payload) + productNameRaw. Recompute idempotente — não
 * apaga nada, raw_payload fica intacto. Default DRY-RUN (não escreve).
 *
 *   npx tsx --env-file=.env.local scripts/backfill-purchase-slug.ts          # dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-purchase-slug.ts --apply  # grava
 */
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { classifyPurchaseProduct } from "@/lib/products";
import { eq } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

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
      id: purchases.id,
      slug: purchases.productSlug,
      name: purchases.productNameRaw,
      status: purchases.status,
      cents: purchases.valueCents,
      raw: purchases.rawPayload,
    })
    .from(purchases);

  // moved[from→to] = { n, approvedCents }
  const moved = new Map<string, { n: number; approvedCents: number }>();
  let changes = 0;

  for (const r of rows) {
    const next = classifyPurchaseProduct(productIdFrom(r.raw), r.name);
    if (next === r.slug) continue;
    changes++;
    const key = `${r.slug} → ${next}`;
    const m = moved.get(key) ?? { n: 0, approvedCents: 0 };
    m.n++;
    if (r.status === "approved") m.approvedCents += Number(r.cents ?? 0);
    moved.set(key, m);
    if (APPLY) {
      await db.update(purchases).set({ productSlug: next }).where(eq(purchases.id, r.id));
    }
  }

  console.log(`\n${APPLY ? "APLICADO" : "DRY-RUN (nada gravado)"} — ${rows.length} compras varridas, ${changes} mudariam:\n`);
  for (const [k, m] of [...moved.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const eur = (m.approvedCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    console.log(`  ${k}:  ${m.n} vendas  ·  ${eur} (aprovadas, moeda nativa somada)`);
  }
  if (!APPLY) console.log(`\nPra gravar: rode de novo com --apply`);
  process.exit(0);
})();
