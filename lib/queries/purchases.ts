import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import {
  whatsappGroupEvents,
  whatsappGroupMembers,
  whatsappGroups,
} from "@/lib/schema/whatsapp";
import type { ProductSlug } from "@/lib/products";
import type { DateRange } from "./dashboard";
import { sumToEur } from "./fx";
import { FX_TO_EUR } from "@/lib/client-config";

const TZ = "America/Sao_Paulo";

function eurFromCents(cents: number | null | undefined, currency: string | null | undefined): number {
  const rate = currency ? (FX_TO_EUR[currency] ?? 1) : 1;
  return (Number(cents ?? 0) * rate) / 100;
}

/**
 * Filtra purchased_at pelo dia-calendário em fuso BR (America/Sao_Paulo).
 *
 * `purchased_at` é timestamptz (instante UTC). Comparar contra `new Date(...)`
 * sem fuso usava o fuso local do processo — na Vercel (UTC) isso jogava compras
 * da madrugada UTC (= noite do dia anterior em BR) pro dia seguinte. Aqui a
 * gente converte o instante pro relógio de parede BR e compara a data, igual ao
 * bucketing diário de `getDailyPurchaseSeries`. Resultado independe do fuso do
 * processo.
 */
function inRangeBR(range: DateRange) {
  return sql`(${purchases.purchasedAt} at time zone ${TZ})::date between ${range.from}::date and ${range.to}::date`;
}

export interface BuyerRow {
  transactionId: string;
  purchasedAt: Date;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhoneE164: string | null;
  valueCents: number | null;
  /** true se está em algum grupo agora, false se está mas saiu, null se telefone faltou */
  inGroup: boolean | null;
}

/**
 * Retorna compradores aprovados de um produto dentro de um período.
 * Faz LEFT JOIN com whatsapp_group_members.phone_normalized pra resolver inGroup.
 * Se buyer_phone_e164 for null, inGroup = null (não rotula como "fora").
 */
export async function getBuyersForCycle(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<BuyerRow[]> {
  const rows = await db
    .select({
      transactionId: purchases.transactionId,
      purchasedAt: purchases.purchasedAt,
      buyerName: purchases.buyerName,
      buyerEmail: purchases.buyerEmail,
      buyerPhoneE164: purchases.buyerPhoneE164,
      valueCents: purchases.valueCents,
      inGroupAny: sql<boolean | null>`
        case
          when ${purchases.buyerPhoneE164} is null then null
          else exists(
            select 1 from ${whatsappGroupMembers}
            where ${whatsappGroupMembers.phoneNormalized} = ${purchases.buyerPhoneE164}
              and ${whatsappGroupMembers.currentlyInGroup} = true
          )
        end
      `,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    )
    .orderBy(sql`${purchases.purchasedAt} desc`);

  return rows.map((r) => ({
    transactionId: r.transactionId,
    purchasedAt: r.purchasedAt,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhoneE164: r.buyerPhoneE164,
    valueCents: r.valueCents,
    inGroup: r.inGroupAny,
  }));
}

/**
 * Conta compras aprovadas de um produto no período.
 */
export async function getApprovedPurchaseCount(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Soma de value_cents (em reais) de compras aprovadas no período.
 */
export async function getApprovedPurchaseRevenue(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<number> {
  const [row] = await db
    .select({
      cents: sumToEur(purchases.valueCents, purchases.currency),
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    );
  return Number(row?.cents ?? 0) / 100;
}

export interface RevenueSplit {
  trafego: number;
  organico: number;
  semAtribuicao: number;
}

/** Receita aprovada (R$) por balde de atribuição no período (fuso BR). */
export async function getRevenueSplit(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<RevenueSplit> {
  const rows = await db
    .select({
      bucket: purchases.trafficSource,
      cents: sumToEur(purchases.valueCents, purchases.currency),
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    )
    .groupBy(purchases.trafficSource);

  const out: RevenueSplit = { trafego: 0, organico: 0, semAtribuicao: 0 };
  for (const r of rows) {
    const reais = Number(r.cents) / 100;
    if (r.bucket === "trafego") out.trafego += reais;
    else if (r.bucket === "organico") out.organico += reais;
    else out.semAtribuicao += reais; // null (pré-backfill) também cai aqui
  }
  return out;
}

/** Receita Hotmart aprovada por NOME de campanha (match do c= do sck), upper-cased. */
export async function getRevenueByCampaignName(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      campaign: sql<string>`upper(${purchases.utmCampaign})`,
      cents: sumToEur(purchases.valueCents, purchases.currency),
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        eq(purchases.trafficSource, "trafego"),
        sql`${purchases.utmCampaign} is not null`,
        inRangeBR(range),
      ),
    )
    .groupBy(sql`upper(${purchases.utmCampaign})`);
  return new Map(rows.map((r) => [r.campaign, Number(r.cents) / 100]));
}

export interface InGroupStats {
  buyersWithPhone: number;
  inGroup: number;
}

/**
 * Quantos compradores aprovados estão atualmente no grupo WhatsApp.
 * Match via phoneNormalized = buyer_phone_e164.
 */
export async function getInGroupStats(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<InGroupStats> {
  const [row] = await db
    .select({
      withPhone: sql<number>`count(*) filter (where ${purchases.buyerPhoneE164} is not null)::int`,
      inGroup: sql<number>`count(*) filter (where exists(
        select 1 from ${whatsappGroupMembers}
        where ${whatsappGroupMembers.phoneNormalized} = ${purchases.buyerPhoneE164}
          and ${whatsappGroupMembers.currentlyInGroup} = true
      ))::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    );
  return {
    buyersWithPhone: Number(row?.withPhone ?? 0),
    inGroup: Number(row?.inGroup ?? 0),
  };
}

/* ─── Ascensão: Desafio (ingresso) → Produto principal ─── */

export interface AscensionRow {
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhoneE164: string | null;
  desafioAt: Date;
  desafioValueEur: number;
  principalSlug: "principal_base" | "principal_prof";
  principalNameRaw: string | null;
  principalAt: Date;
  principalValueEur: number;
}

export interface AscensionStats {
  /** compradores DISTINTOS do Desafio no período (com email ou telefone) */
  desafioBuyers: number;
  /** coorte madura: janela de ascensão já fechou (teve chance completa) */
  settledBuyers: number;
  /** coorte cuja janela ainda está aberta — pode ainda ascender (semana fresca) */
  maturingBuyers: number;
  /** total que ascendeu (maduros + os que já subiram dentro da janela aberta) */
  ascended: number;
  /** ascensões SÓ da coorte madura — numerador da taxa */
  ascendedSettled: number;
  ascendedBase: number;
  ascendedProf: number;
  /** taxa "justa" = ascendedSettled / settledBuyers (0..1) — não dilui com fresca */
  rate: number;
  /** receita EUR da 1ª compra principal de cada ascendido */
  principalRevenueEur: number;
  /** janela de atribuição em dias (relativa à compra do ingresso) */
  windowDays: number;
  rows: AscensionRow[];
}

/**
 * Janela de atribuição da ascensão (dias após a compra do ingresso). 21 = semana
 * do curso (oferta) + semana de recuperação. Validado no histórico (jun/2026):
 * mediana 14d, 76% das ascensões caem em ≤21d. Trocar pra 14 = só a oferta do
 * curso (mais estrito). Ver plano 2026-06-21.
 */
const ASCENSION_WINDOW_DAYS = 21;

/**
 * Taxa de ascensão do funil do Desafio: dos compradores do ingresso (slug
 * "desafio") no período, quantos compraram um PRODUTO PRINCIPAL (base/prof)
 * depois — a oferta do principal acontece durante/após os 7 dias do desafio.
 *
 * Identidade do comprador = email (preferido) ou telefone E.164. Ascensão =
 * compra aprovada de principal do mesmo comprador entre a compra do desafio e
 * ASCENSION_WINDOW_DAYS dias depois. Pega a 1ª compra principal (row_number=1).
 *
 * Janela relativa por comprador → funciona no modelo rolante semanal (cada
 * pessoa medida a partir da própria compra), independente de quando se olha.
 */
export async function getAscensionToPrincipal(range: DateRange): Promise<AscensionStats> {
  // Uma query: cada comprador da coorte do Desafio + sua 1ª compra de principal
  // dentro da janela (left join, pode ser null) + flag `settled` (janela fechou).
  const result = (await db.execute(sql`
    with desafio_cohort as (
      select
        coalesce(nullif(lower(trim(${purchases.buyerEmail})), ''), ${purchases.buyerPhoneE164}) as ident,
        min(${purchases.purchasedAt}) as desafio_at,
        (array_agg(${purchases.buyerName}      order by ${purchases.purchasedAt}))[1] as name,
        (array_agg(${purchases.buyerEmail}     order by ${purchases.purchasedAt}))[1] as email,
        (array_agg(${purchases.buyerPhoneE164} order by ${purchases.purchasedAt}))[1] as phone,
        (array_agg(${purchases.valueCents}     order by ${purchases.purchasedAt}))[1] as desafio_cents,
        (array_agg(${purchases.currency}       order by ${purchases.purchasedAt}))[1] as desafio_currency
      from ${purchases}
      where ${purchases.productSlug} = 'desafio'
        and ${purchases.status} = 'approved'
        and (${purchases.purchasedAt} at time zone ${TZ})::date between ${range.from}::date and ${range.to}::date
        and coalesce(nullif(lower(trim(${purchases.buyerEmail})), ''), ${purchases.buyerPhoneE164}) is not null
      group by 1
    ),
    asc_first as (
      select ident, principal_slug, principal_name, principal_cents, principal_currency, principal_at
      from (
        select dc.ident,
               p.product_slug     as principal_slug,
               p.product_name_raw as principal_name,
               p.value_cents      as principal_cents,
               p.currency         as principal_currency,
               p.purchased_at     as principal_at,
               row_number() over (partition by dc.ident order by p.purchased_at) as rn
        from desafio_cohort dc
        join ${purchases} p
          on p.status = 'approved'
         and p.product_slug in ('principal_base', 'principal_prof')
         and p.purchased_at >= dc.desafio_at
         and p.purchased_at <= dc.desafio_at + make_interval(days => ${ASCENSION_WINDOW_DAYS})
         and (
              (dc.email is not null and lower(trim(p.buyer_email)) = dc.email)
           or (dc.phone is not null and p.buyer_phone_e164 = dc.phone)
         )
      ) z
      where rn = 1
    )
    select
      dc.name, dc.email, dc.phone, dc.desafio_at, dc.desafio_cents, dc.desafio_currency,
      (dc.desafio_at + make_interval(days => ${ASCENSION_WINDOW_DAYS}) <= now()) as settled,
      af.principal_slug, af.principal_name, af.principal_cents, af.principal_currency, af.principal_at
    from desafio_cohort dc
    left join asc_first af on af.ident = dc.ident
    order by af.principal_at desc nulls last
  `)) as unknown as Array<{
    name: string | null; email: string | null; phone: string | null;
    desafio_at: string; desafio_cents: number | null; desafio_currency: string | null;
    settled: boolean;
    principal_slug: "principal_base" | "principal_prof" | null;
    principal_name: string | null; principal_cents: number | null;
    principal_currency: string | null; principal_at: string | null;
  }>;

  const desafioBuyers = result.length;
  const settledBuyers = result.filter((r) => r.settled).length;
  const maturingBuyers = desafioBuyers - settledBuyers;

  const rows: AscensionRow[] = result
    .filter((r) => r.principal_slug !== null && r.principal_at !== null)
    .map((r) => ({
      buyerName: r.name,
      buyerEmail: r.email,
      buyerPhoneE164: r.phone,
      desafioAt: new Date(r.desafio_at),
      desafioValueEur: eurFromCents(r.desafio_cents, r.desafio_currency),
      principalSlug: r.principal_slug as "principal_base" | "principal_prof",
      principalNameRaw: r.principal_name,
      principalAt: new Date(r.principal_at as string),
      principalValueEur: eurFromCents(r.principal_cents, r.principal_currency),
    }));

  const ascendedSettled = result.filter((r) => r.settled && r.principal_slug !== null).length;
  const ascendedBase = rows.filter((r) => r.principalSlug === "principal_base").length;
  const ascendedProf = rows.filter((r) => r.principalSlug === "principal_prof").length;
  const principalRevenueEur = rows.reduce((s, r) => s + r.principalValueEur, 0);

  return {
    desafioBuyers,
    settledBuyers,
    maturingBuyers,
    ascended: rows.length,
    ascendedSettled,
    ascendedBase,
    ascendedProf,
    rate: settledBuyers > 0 ? ascendedSettled / settledBuyers : 0,
    principalRevenueEur,
    windowDays: ASCENSION_WINDOW_DAYS,
    rows,
  };
}

export interface DailyPurchasePoint {
  date: string;
  count: number;
  revenueCents: number;
}

/**
 * Série diária de compras aprovadas pra alimentar gráfico de barras.
 * Datas no fuso America/Sao_Paulo. Só retorna dias com compras (caller preenche zeros).
 */
export async function getDailyPurchaseSeries(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<DailyPurchasePoint[]> {
  const rows = await db
    .select({
      date: sql<string>`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      revenueCents: sumToEur(purchases.valueCents, purchases.currency),
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    )
    .groupBy(
      sql`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    )
    .orderBy(
      sql`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    );
  return rows.map((r) => ({
    date: r.date,
    count: Number(r.count),
    revenueCents: Number(r.revenueCents),
  }));
}

/**
 * Série diária de compras aprovadas para um CONJUNTO de slugs (ex.: os dois
 * produtos principais). Mesma forma do getDailyPurchaseSeries.
 */
export async function getDailyPurchaseSeriesForSlugs(
  slugs: string[],
  range: DateRange,
): Promise<DailyPurchasePoint[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({
      date: sql<string>`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      revenueCents: sumToEur(purchases.valueCents, purchases.currency),
    })
    .from(purchases)
    .where(
      and(
        inArray(purchases.productSlug, slugs),
        eq(purchases.status, "approved"),
        inRangeBR(range),
      ),
    )
    .groupBy(
      sql`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    )
    .orderBy(
      sql`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    );
  return rows.map((r) => ({
    date: r.date,
    count: Number(r.count),
    revenueCents: Number(r.revenueCents),
  }));
}

export interface BuyerPurchaseEntry {
  transactionId: string;
  productSlug: string;
  productNameRaw: string | null;
  status: string;
  valueCents: number | null;
  purchasedAt: Date;
}

export interface BuyerGroupEvent {
  groupName: string | null;
  eventType: "joined" | "left" | "unknown";
  occurredAt: Date;
}

export interface BuyerJourney {
  purchases: BuyerPurchaseEntry[];
  whatsappEvents: BuyerGroupEvent[];
}

/**
 * Histórico completo de um comprador identificado por email OU phone.
 * Casa por OR — se ambos vierem, busca em qualquer um. Sem identifier → vazio.
 */
export async function getBuyerJourney(
  identifier: { email?: string | null; phone?: string | null },
): Promise<BuyerJourney> {
  const email = identifier.email?.trim() || null;
  const phone = identifier.phone?.trim() || null;
  if (!email && !phone) return { purchases: [], whatsappEvents: [] };

  const purchaseConds = [];
  if (email) purchaseConds.push(eq(purchases.buyerEmail, email));
  if (phone) purchaseConds.push(eq(purchases.buyerPhoneE164, phone));
  const purchaseWhere =
    purchaseConds.length === 1
      ? purchaseConds[0]
      : sql`(${sql.join(purchaseConds, sql` OR `)})`;

  const purchaseRows = await db
    .select({
      transactionId: purchases.transactionId,
      productSlug: purchases.productSlug,
      productNameRaw: purchases.productNameRaw,
      status: purchases.status,
      valueCents: purchases.valueCents,
      purchasedAt: purchases.purchasedAt,
    })
    .from(purchases)
    .where(purchaseWhere)
    .orderBy(sql`${purchases.purchasedAt} desc`);

  // Eventos de grupo só por phone (sendflow não rastreia email)
  let eventRows: { groupName: string | null; eventType: "joined" | "left" | "unknown"; occurredAt: Date }[] = [];
  if (phone) {
    eventRows = await db
      .select({
        groupName: whatsappGroups.name,
        eventType: whatsappGroupEvents.eventType,
        occurredAt: whatsappGroupEvents.occurredAt,
      })
      .from(whatsappGroupEvents)
      .leftJoin(
        whatsappGroups,
        eq(whatsappGroupEvents.groupExternalId, whatsappGroups.externalId),
      )
      .where(eq(whatsappGroupEvents.phoneNormalized, phone))
      .orderBy(sql`${whatsappGroupEvents.occurredAt} desc`);
  }

  return {
    purchases: purchaseRows.map((p) => ({
      transactionId: p.transactionId,
      productSlug: p.productSlug,
      productNameRaw: p.productNameRaw,
      status: p.status,
      valueCents: p.valueCents,
      purchasedAt: p.purchasedAt,
    })),
    whatsappEvents: eventRows.map((e) => ({
      groupName: e.groupName,
      eventType: e.eventType,
      occurredAt: e.occurredAt,
    })),
  };
}
