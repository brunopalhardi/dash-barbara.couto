import { sql, type SQL } from "drizzle-orm";
import { FX_TO_EUR } from "@/lib/client-config";

/**
 * Soma uma coluna de valor (gasto, value_cents, etc.) convertendo CADA linha
 * pra EUR pela taxa da moeda daquela linha (coluna `currency`). Robusto a
 * contas/vendas multi-moeda. Fallback (moeda sem taxa) = mantém o valor cru.
 *
 * Uso:
 *   sumToEur(adInsightsDaily.spend, adAccounts.currency)   // gasto
 *   sumToEur(purchases.valueCents, purchases.currency)     // receita (cents)
 */
export function sumToEur(amount: SQL | SQL.Aliased | unknown, currency: unknown): SQL<number> {
  const amt = sql`${amount}`;
  const cur = sql`${currency}`;
  const whens = Object.entries(FX_TO_EUR).map(
    // ::numeric — value_cents é integer; sem o cast, `integer * 1.17` faz o
    // Postgres tentar converter a taxa pra integer e quebra (22P02).
    ([code, rate]) => sql`when ${cur} = ${code} then (${amt})::numeric * ${rate}`,
  );
  return sql<number>`coalesce(sum(case ${sql.join(whens, sql` `)} else (${amt})::numeric end)::float, 0)`;
}

/** Converte um valor por-linha (sem sum) pra EUR pela taxa da moeda da linha. */
export function toEur(amount: SQL | unknown, currency: unknown): SQL<number> {
  const amt = sql`${amount}`;
  const cur = sql`${currency}`;
  const whens = Object.entries(FX_TO_EUR).map(
    // ::numeric — value_cents é integer; sem o cast, `integer * 1.17` faz o
    // Postgres tentar converter a taxa pra integer e quebra (22P02).
    ([code, rate]) => sql`when ${cur} = ${code} then (${amt})::numeric * ${rate}`,
  );
  return sql<number>`coalesce(case ${sql.join(whens, sql` `)} else (${amt})::numeric end::float, 0)`;
}
