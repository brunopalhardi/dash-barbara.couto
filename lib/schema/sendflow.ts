import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  jsonb,
  boolean,
  date,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────────────
 * Releases (campanhas) do SendFlow.
 *
 * Cada release agrupa múltiplos grupos de WhatsApp (ex: "LC16 - DO CAOS A
 * CALMA" tem 30+ grupos). external_id é o ID Firebase do SendFlow
 * (ex: "0016PzrvpbQwriIJEvmx"), populado via GET /releases.
 * ──────────────────────────────────────────────────────────────────────── */
export const sendflowReleases = pgTable(
  "sendflow_releases",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** ID do SendFlow (Firebase-like, ex: 0016PzrvpbQwriIJEvmx) */
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug"),
    archived: boolean("archived").notNull().default(false),
    /** Payload bruto pra debug/futura expansão (admins, group config, etc) */
    rawPayload: jsonb("raw_payload"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sendflow_releases_external_id_uq").on(t.externalId),
    index("sendflow_releases_archived_idx").on(t.archived),
  ],
);

/* ────────────────────────────────────────────────────────────────────────
 * Analytics diárias por release (adds/removals/clicks).
 *
 * GET /releases/{id}/analytics devolve `{ add: { dates: {DDMMYYYY: N} },
 * remove: {...}, clicks: {...} }`. A gente desnormaliza pra (release, date)
 * com colunas separadas — facilita query "evolução de X últimos dias".
 *
 * Upsert por (release_id, date) — sync diário re-baixa o histórico inteiro
 * e idempotentemente atualiza. SendFlow não tem versionamento, então
 * a estratégia é "sempre confiar no último GET".
 * ──────────────────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────────────────
 * Lead scoring por release (engajamento agregado pelo SendFlow).
 *
 * GET /releases/{id}/leadscoring/download devolve URL Firebase com CSV:
 *   Posição;Número;Score
 *   1;5521996618758;11600
 *
 * Re-baixado a cada sync diário (re-rank pode mudar). Admins filtrados
 * via lib/sendflow/admins. Unique por (release, phone) — upsert atualiza
 * score/rank/fetched_at.
 *
 * Rate limit do download é apertado (~10min entre calls). Cron diário
 * funciona, mas teste local é lento.
 * ──────────────────────────────────────────────────────────────────────── */
export const sendflowLeadscoring = pgTable(
  "sendflow_leadscoring",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    releaseId: bigint("release_id", { mode: "number" })
      .notNull()
      .references(() => sendflowReleases.id, { onDelete: "cascade" }),
    phoneNormalized: text("phone_normalized").notNull(),
    score: integer("score").notNull(),
    rank: integer("rank").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sendflow_leadscoring_release_phone_uq").on(
      t.releaseId,
      t.phoneNormalized,
    ),
    index("sendflow_leadscoring_score_idx").on(t.releaseId, t.score),
    index("sendflow_leadscoring_phone_idx").on(t.phoneNormalized),
  ],
);

export const sendflowAnalyticsDaily = pgTable(
  "sendflow_analytics_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    releaseId: bigint("release_id", { mode: "number" })
      .notNull()
      .references(() => sendflowReleases.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    adds: integer("adds").notNull().default(0),
    removals: integer("removals").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sendflow_analytics_daily_release_date_uq").on(
      t.releaseId,
      t.date,
    ),
    index("sendflow_analytics_daily_date_idx").on(t.date),
  ],
);
