/**
 * Queries de tracking orgânico (UTMs capturados pelo /api/track/lead).
 *
 * Convenção de UTMs esperada pra esse painel funcionar:
 *   utm_medium=organic     → identifica que é orgânico
 *   utm_source=<origem>    → reels / bio / grupos / email / …
 *   utm_campaign=<produto>_<ciclo>  → ex.: "desafio_2026_05" pra filtrar por produto
 *
 * Pra cada produto, filtramos por:
 *   - source = 'organic' (atribuído pelo endpoint baseado em utm_medium=organic ou utm_source=organic_*)
 *   - utm_campaign matches o slug do produto (case-insensitive)
 */
import { and, eq, gte, lte, sql, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads } from "@/lib/schema/leads";
import type { ProductSlug } from "@/lib/products";
import type { DateRange } from "./dashboard";

export interface OrganicSummary {
  totalLeads: number;
  byOrigin: Array<{ source: string; count: number; pct: number }>;
  daily: Array<{ date: string; count: number }>;
}

function productMatchClause(slug: ProductSlug) {
  // utm_campaign costuma vir tipo "desafio_2026_05" ou "desafio". Match parcial.
  // Se slug = "geral", não filtra por produto (mostra tudo orgânico).
  if (slug === "geral") return undefined;
  return or(
    ilike(leads.utmCampaign, `${slug}%`),
    ilike(leads.utmCampaign, `%_${slug}_%`),
    ilike(leads.utmCampaign, `%-${slug}-%`),
  );
}

export async function getOrganicSummary(
  slug: ProductSlug,
  range: DateRange,
): Promise<OrganicSummary> {
  const conds = [
    eq(leads.source, "organic"),
    gte(leads.capturedAt, new Date(range.from + "T00:00:00")),
    lte(leads.capturedAt, new Date(range.to + "T23:59:59")),
  ];
  const productMatch = productMatchClause(slug);
  if (productMatch) conds.push(productMatch);

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(...conds));

  const byOriginRows = await db
    .select({
      source: sql<string>`coalesce(${leads.utmSource}, 'desconhecido')`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(and(...conds))
    .groupBy(sql`coalesce(${leads.utmSource}, 'desconhecido')`)
    .orderBy(sql`count(*) desc`);

  const dailyRows = await db
    .select({
      date: sql<string>`to_char(${leads.capturedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(and(...conds))
    .groupBy(sql`to_char(${leads.capturedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${leads.capturedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`);

  const total = Number(totalRow?.n ?? 0);
  const byOrigin = byOriginRows.map((r) => ({
    source: r.source,
    count: Number(r.count),
    pct: total > 0 ? (Number(r.count) / total) * 100 : 0,
  }));

  return {
    totalLeads: total,
    byOrigin,
    daily: dailyRows.map((r) => ({ date: r.date, count: Number(r.count) })),
  };
}
