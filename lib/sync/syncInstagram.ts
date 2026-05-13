import { eq, and, lt } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import {
  igAccounts,
  igInsightsDaily,
  igMedia,
  igMediaInsights,
} from "@/lib/schema/instagram";
import { syncJobs } from "@/lib/schema/sync";
import type { InstagramClient } from "@/lib/instagram/client";
import type { IgInsightItem } from "@/lib/instagram/types";
import { MetaAuthError } from "@/lib/meta/errors";

export type IgSyncMode = "backfill" | "daily" | "manual";

/** Janela em dias por modo */
const MODE_WINDOW_DAYS: Record<IgSyncMode, number> = {
  backfill: 30,
  daily: 7,
  manual: 30,
};

const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

async function reapOrphanJobs(db: typeof defaultDb): Promise<number[]> {
  const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
  const reaped = await db
    .update(syncJobs)
    .set({
      status: "failed",
      finishedAt: new Date(),
      errorMessage: "vercel timeout (orphan reaped)",
    })
    .where(and(eq(syncJobs.status, "running"), lt(syncJobs.startedAt, cutoff)))
    .returning({ id: syncJobs.id });
  return reaped.map((r) => r.id);
}

function findInsightValue(items: IgInsightItem[], name: string, endTimeIso: string): number {
  const item = items.find((i) => i.name === name);
  if (!item) return 0;
  const v = item.values.find((x) => x.end_time?.startsWith(endTimeIso));
  return v ? Number(v.value ?? 0) : 0;
}

function mapMediaType(meta: { media_type?: string; media_product_type?: string }):
  | "image"
  | "video"
  | "carousel_album"
  | "reels"
  | "story"
  | "other" {
  if (meta.media_product_type === "REELS") return "reels";
  if (meta.media_product_type === "STORY") return "story";
  const t = meta.media_type?.toUpperCase();
  if (t === "IMAGE") return "image";
  if (t === "VIDEO") return "video";
  if (t === "CAROUSEL_ALBUM") return "carousel_album";
  return "other";
}

interface AccountSyncResult {
  accountId: number;
  igUserId: string;
  rowsByTable: Record<string, number>;
  error?: string;
}

interface SyncIgDeps {
  db?: typeof defaultDb;
  client: InstagramClient;
}

export async function syncInstagram(
  opts: { mode: IgSyncMode } & SyncIgDeps,
): Promise<{ jobId: number; status: "done" | "failed"; results: AccountSyncResult[] }> {
  const db = opts.db ?? defaultDb;
  await reapOrphanJobs(db);

  const jobType =
    opts.mode === "backfill" ? "ig_full" : opts.mode === "daily" ? "ig_incremental" : "ig_manual";

  const [job] = await db
    .insert(syncJobs)
    .values({ type: jobType, status: "running", startedAt: new Date() })
    .returning({ id: syncJobs.id });

  const accounts = await db.select().from(igAccounts).where(eq(igAccounts.isActive, true));
  const results: AccountSyncResult[] = [];

  const windowDays = MODE_WINDOW_DAYS[opts.mode];
  const until = Math.floor(Date.now() / 1000);
  const since = until - windowDays * 86400;

  for (const account of accounts) {
    const r: AccountSyncResult = {
      accountId: account.id,
      igUserId: account.igUserId,
      rowsByTable: { profile: 0, insights_daily: 0, media: 0, media_insights: 0 },
    };

    try {
      // 1. Profile snapshot
      const profile = await opts.client.getAccount(account.igUserId);
      await db
        .update(igAccounts)
        .set({
          username: profile.username,
          name: profile.name ?? account.name,
          biography: profile.biography ?? account.biography,
          profilePictureUrl: profile.profile_picture_url ?? account.profilePictureUrl,
          followersCount: profile.followers_count ?? account.followersCount,
          followsCount: profile.follows_count ?? account.followsCount,
          mediaCount: profile.media_count ?? account.mediaCount,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(igAccounts.id, account.id));
      r.rowsByTable.profile = 1;

      // 2. Daily account insights (reach + profile_views + follower_count)
      const dailyMetrics = ["reach", "profile_views", "follower_count"];
      const insights = await opts.client
        .getDailyAccountInsights({
          igUserId: account.igUserId,
          metrics: dailyMetrics,
          since,
          until,
        })
        .catch((err) => {
          // Algumas dessas métricas podem não estar disponíveis dependendo da conta —
          // log e segue. Não derruba o sync inteiro.
          console.warn(
            JSON.stringify({
              msg: "ig_account_insights_failed",
              igUserId: account.igUserId,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
          return [] as IgInsightItem[];
        });

      // Agrupa por end_time (YYYY-MM-DD)
      const dates = new Set<string>();
      for (const it of insights) {
        for (const v of it.values) {
          if (v.end_time) dates.add(v.end_time.slice(0, 10));
        }
      }
      for (const date of dates) {
        await db
          .insert(igInsightsDaily)
          .values({
            accountId: account.id,
            date,
            reach: findInsightValue(insights, "reach", date),
            profileViews: findInsightValue(insights, "profile_views", date),
            followerCount: findInsightValue(insights, "follower_count", date),
          })
          .onConflictDoUpdate({
            target: [igInsightsDaily.accountId, igInsightsDaily.date],
            set: {
              reach: findInsightValue(insights, "reach", date),
              profileViews: findInsightValue(insights, "profile_views", date),
              followerCount: findInsightValue(insights, "follower_count", date),
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.insights_daily++;
      }

      // 3. Media (posts recentes)
      const mediaLimit = opts.mode === "backfill" ? 200 : 50;
      const media = await opts.client.getMedia(account.igUserId, { limit: mediaLimit });
      for (const m of media) {
        await db
          .insert(igMedia)
          .values({
            accountId: account.id,
            igMediaId: m.id,
            type: mapMediaType(m),
            caption: m.caption,
            permalink: m.permalink,
            mediaUrl: m.media_url,
            thumbnailUrl: m.thumbnail_url,
            timestamp: m.timestamp ? new Date(m.timestamp) : null,
          })
          .onConflictDoUpdate({
            target: igMedia.igMediaId,
            set: {
              type: mapMediaType(m),
              caption: m.caption,
              permalink: m.permalink,
              mediaUrl: m.media_url,
              thumbnailUrl: m.thumbnail_url,
              timestamp: m.timestamp ? new Date(m.timestamp) : null,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.media++;
      }

      // 4. Media insights (apenas pros media salvos no DB que são do tipo certo)
      const mediaRows = await db
        .select({ id: igMedia.id, igMediaId: igMedia.igMediaId, type: igMedia.type })
        .from(igMedia)
        .where(eq(igMedia.accountId, account.id));
      const today = new Date().toISOString().slice(0, 10);
      const mediaMetrics = ["reach", "impressions", "saved", "shares", "total_interactions"];
      for (const m of mediaRows) {
        if (m.type === "story") continue; // stories expiram, métricas raras
        const ins = await opts.client.getMediaInsights(m.igMediaId, mediaMetrics).catch(() => []);
        if (ins.length === 0) continue;
        const get = (name: string) => Number(ins.find((i) => i.name === name)?.values?.[0]?.value ?? 0);
        const reach = get("reach");
        const engagement = get("total_interactions");
        await db
          .insert(igMediaInsights)
          .values({
            mediaId: m.id,
            syncedAt: today,
            reach,
            impressions: get("impressions"),
            engagement,
            saved: get("saved"),
            shares: get("shares"),
            engagementRate: reach > 0 ? ((engagement / reach) * 100).toFixed(4) : null,
          })
          .onConflictDoUpdate({
            target: [igMediaInsights.mediaId, igMediaInsights.syncedAt],
            set: {
              reach,
              impressions: get("impressions"),
              engagement,
              saved: get("saved"),
              shares: get("shares"),
              engagementRate: reach > 0 ? ((engagement / reach) * 100).toFixed(4) : null,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.media_insights++;
      }
    } catch (err) {
      r.error = err instanceof Error ? err.message : String(err);
      if (err instanceof MetaAuthError) {
        console.error(JSON.stringify({ msg: "ig_auth_error", accountId: account.id }));
      }
    }

    results.push(r);
  }

  const totalRows = results.reduce(
    (sum, r) => sum + Object.values(r.rowsByTable).reduce((a, b) => a + b, 0),
    0,
  );
  const anyFailed = results.some((r) => r.error);
  const allFailed = results.length > 0 && results.every((r) => r.error);
  const status: "done" | "failed" = allFailed ? "failed" : "done";

  await db
    .update(syncJobs)
    .set({
      status,
      finishedAt: new Date(),
      rowsProcessed: totalRows,
      errorMessage: anyFailed ? "see details" : null,
      details: { mode: opts.mode, results } as Record<string, unknown>,
    })
    .where(eq(syncJobs.id, job.id));

  return { jobId: job.id, status, results };
}
