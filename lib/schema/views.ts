import {
  pgMaterializedView,
  bigint,
  date,
  numeric,
} from "drizzle-orm/pg-core";

/**
 * Declaração das materialized views existentes em prod.
 *
 * `.existing()` informa ao Drizzle que a view já foi criada por migration
 * manual (`drizzle/manual/`) e não deve ser tocada por `db:push`. Resolve
 * a pendência conhecida no CLAUDE.md (db:push dropava as MVs).
 *
 * Schema reflete o estado pós-migration `002_pixel_funnel_views.sql`.
 */

export const adsetInsightsDaily = pgMaterializedView("adset_insights_daily", {
  adsetId: bigint("adset_id", { mode: "number" }).notNull(),
  date: date("date").notNull(),
  impressions: bigint("impressions", { mode: "number" }),
  clicks: bigint("clicks", { mode: "number" }),
  spend: numeric("spend", { precision: 14, scale: 2 }),
  cpm: numeric("cpm", { precision: 14, scale: 4 }),
  ctr: numeric("ctr", { precision: 8, scale: 4 }),
  linkClicks: bigint("link_clicks", { mode: "number" }),
  videoViews: bigint("video_views", { mode: "number" }),
  landingPageView: bigint("landing_page_view", { mode: "number" }),
  initiateCheckout: bigint("initiate_checkout", { mode: "number" }),
  purchase: bigint("purchase", { mode: "number" }),
  revenue: numeric("revenue", { precision: 14, scale: 2 }),
}).existing();

export const campaignInsightsDaily = pgMaterializedView(
  "campaign_insights_daily",
  {
    campaignId: bigint("campaign_id", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    impressions: bigint("impressions", { mode: "number" }),
    clicks: bigint("clicks", { mode: "number" }),
    spend: numeric("spend", { precision: 14, scale: 2 }),
    cpm: numeric("cpm", { precision: 14, scale: 4 }),
    ctr: numeric("ctr", { precision: 8, scale: 4 }),
    linkClicks: bigint("link_clicks", { mode: "number" }),
    landingPageView: bigint("landing_page_view", { mode: "number" }),
    initiateCheckout: bigint("initiate_checkout", { mode: "number" }),
    purchase: bigint("purchase", { mode: "number" }),
    revenue: numeric("revenue", { precision: 14, scale: 2 }),
  },
).existing();
