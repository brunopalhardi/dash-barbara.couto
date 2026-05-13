import {
  pgTable,
  bigserial,
  bigint,
  text,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────────────
 * Conta Instagram Business conectada
 * ──────────────────────────────────────────────────────────────────────── */
export const igAccounts = pgTable(
  "ig_accounts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** ID numérico do IG Business Account (ex.: "17841401234567890") */
    igUserId: text("ig_user_id").notNull(),
    username: text("username").notNull(),
    name: text("name"),
    profilePictureUrl: text("profile_picture_url"),
    biography: text("biography"),
    /** Page ID do Facebook vinculada (necessário pra alguns endpoints) */
    fbPageId: text("fb_page_id"),
    /** Token criptografado se o user conectou via OAuth próprio; senão usamos env var */
    accessTokenEncrypted: text("access_token_encrypted"),
    isActive: boolean("is_active").notNull().default(true),
    /** Snapshot dos contadores na última sync (pra exibir rápido sem agregação) */
    followersCount: integer("followers_count").default(0),
    followsCount: integer("follows_count").default(0),
    mediaCount: integer("media_count").default(0),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("ig_accounts_ig_user_id_uq").on(t.igUserId)],
);

/* ────────────────────────────────────────────────────────────────────────
 * Métricas diárias da conta (Instagram Insights)
 * Endpoint: /{ig-user-id}/insights?metric=reach,profile_views,follower_count&period=day
 * ──────────────────────────────────────────────────────────────────────── */
export const igInsightsDaily = pgTable(
  "ig_insights_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    accountId: bigint("account_id", { mode: "number" })
      .notNull()
      .references(() => igAccounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** Pessoas únicas alcançadas no dia */
    reach: integer("reach").default(0),
    /** Visitas ao perfil */
    profileViews: integer("profile_views").default(0),
    /** Variação diária de seguidores (pode ser negativa) */
    followerCount: integer("follower_count").default(0),
    /** Snapshot absoluto pra cada dia (calculado pelo sync, não vem da API) */
    followersSnapshot: integer("followers_snapshot"),
    /** Cliques em link do perfil + email + tap-to-call (quando disponível) */
    websiteClicks: integer("website_clicks").default(0),
    emailContacts: integer("email_contacts").default(0),
    phoneCallClicks: integer("phone_call_clicks").default(0),
    /** Bag pra métricas extras que o Meta lançar no futuro */
    extra: jsonb("extra").$type<Record<string, number>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ig_insights_daily_account_date_uq").on(t.accountId, t.date),
    index("ig_insights_daily_date_idx").on(t.date),
  ],
);

export const igMediaType = pgEnum("ig_media_type", [
  "image",
  "video",
  "carousel_album",
  "reels",
  "story",
  "other",
]);

/* ────────────────────────────────────────────────────────────────────────
 * Posts/Reels/Stories
 * Endpoint: /{ig-user-id}/media
 * ──────────────────────────────────────────────────────────────────────── */
export const igMedia = pgTable(
  "ig_media",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    accountId: bigint("account_id", { mode: "number" })
      .notNull()
      .references(() => igAccounts.id, { onDelete: "cascade" }),
    /** ID do post no Meta */
    igMediaId: text("ig_media_id").notNull(),
    type: igMediaType("type").notNull().default("other"),
    caption: text("caption"),
    permalink: text("permalink"),
    mediaUrl: text("media_url"),
    thumbnailUrl: text("thumbnail_url"),
    timestamp: timestamp("timestamp", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ig_media_meta_id_uq").on(t.igMediaId),
    index("ig_media_account_idx").on(t.accountId),
    index("ig_media_timestamp_idx").on(t.timestamp),
  ],
);

/* ────────────────────────────────────────────────────────────────────────
 * Insights por post (engagement, impressions, reach, saved, plays)
 * Endpoint: /{ig-media-id}/insights
 * ──────────────────────────────────────────────────────────────────────── */
export const igMediaInsights = pgTable(
  "ig_media_insights",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    mediaId: bigint("media_id", { mode: "number" })
      .notNull()
      .references(() => igMedia.id, { onDelete: "cascade" }),
    /** Snapshot date (Meta retorna métrica cumulativa, então guardamos por data) */
    syncedAt: date("synced_at").notNull(),
    reach: integer("reach").default(0),
    impressions: integer("impressions").default(0),
    engagement: integer("engagement").default(0),
    saved: integer("saved").default(0),
    shares: integer("shares").default(0),
    comments: integer("comments").default(0),
    likes: integer("likes").default(0),
    videoViews: integer("video_views").default(0),
    /** ER = engagement / reach (calculado) */
    engagementRate: numeric("engagement_rate", { precision: 8, scale: 4 }),
    extra: jsonb("extra").$type<Record<string, number>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ig_media_insights_media_date_uq").on(t.mediaId, t.syncedAt),
  ],
);
