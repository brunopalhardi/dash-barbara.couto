import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  igAccounts,
  igInsightsDaily,
  igMedia,
  igMediaInsights,
} from "@/lib/schema/instagram";

export interface IgDateRange {
  from: string;
  to: string;
}

export interface IgKpis {
  followers: number;
  followsCount: number;
  mediaCount: number;
  reach: number;
  profileViews: number;
  /** Soma da variação diária no período */
  followerDelta: number;
  /** ER médio dos posts (engagement / reach) — quando disponível */
  avgEngagementRate: number;
  postsInPeriod: number;
}

export interface IgDailyPoint {
  date: string;
  reach: number;
  profileViews: number;
  followerCount: number;
  followersSnapshot: number | null;
}

export interface IgTopPost {
  mediaId: number;
  igMediaId: string;
  type: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  timestamp: Date | null;
  reach: number;
  engagement: number;
  saved: number;
  shares: number;
  engagementRate: number;
}

export async function getActiveIgAccount() {
  const [account] = await db
    .select()
    .from(igAccounts)
    .where(eq(igAccounts.isActive, true))
    .limit(1);
  return account ?? null;
}

export async function getIgKpis(range: IgDateRange): Promise<IgKpis> {
  const account = await getActiveIgAccount();
  if (!account) {
    return {
      followers: 0,
      followsCount: 0,
      mediaCount: 0,
      reach: 0,
      profileViews: 0,
      followerDelta: 0,
      avgEngagementRate: 0,
      postsInPeriod: 0,
    };
  }

  const [periodRow] = await db
    .select({
      reach: sql<number>`coalesce(sum(${igInsightsDaily.reach})::int, 0)`,
      profileViews: sql<number>`coalesce(sum(${igInsightsDaily.profileViews})::int, 0)`,
      followerDelta: sql<number>`coalesce(sum(${igInsightsDaily.followerCount})::int, 0)`,
    })
    .from(igInsightsDaily)
    .where(
      and(
        eq(igInsightsDaily.accountId, account.id),
        gte(igInsightsDaily.date, range.from),
        lte(igInsightsDaily.date, range.to),
      ),
    );

  const [erRow] = await db
    .select({
      avgEr: sql<number>`coalesce(avg(${igMediaInsights.engagementRate})::float, 0)`,
      postCount: sql<number>`count(distinct ${igMediaInsights.mediaId})::int`,
    })
    .from(igMediaInsights)
    .innerJoin(igMedia, eq(igMedia.id, igMediaInsights.mediaId))
    .where(
      and(
        eq(igMedia.accountId, account.id),
        gte(igMediaInsights.syncedAt, range.from),
        lte(igMediaInsights.syncedAt, range.to),
      ),
    );

  return {
    followers: account.followersCount ?? 0,
    followsCount: account.followsCount ?? 0,
    mediaCount: account.mediaCount ?? 0,
    reach: Number(periodRow?.reach ?? 0),
    profileViews: Number(periodRow?.profileViews ?? 0),
    followerDelta: Number(periodRow?.followerDelta ?? 0),
    avgEngagementRate: Number(erRow?.avgEr ?? 0),
    postsInPeriod: Number(erRow?.postCount ?? 0),
  };
}

export async function getIgDailySeries(range: IgDateRange): Promise<IgDailyPoint[]> {
  const account = await getActiveIgAccount();
  if (!account) return [];

  const rows = await db
    .select({
      date: igInsightsDaily.date,
      reach: igInsightsDaily.reach,
      profileViews: igInsightsDaily.profileViews,
      followerCount: igInsightsDaily.followerCount,
      followersSnapshot: igInsightsDaily.followersSnapshot,
    })
    .from(igInsightsDaily)
    .where(
      and(
        eq(igInsightsDaily.accountId, account.id),
        gte(igInsightsDaily.date, range.from),
        lte(igInsightsDaily.date, range.to),
      ),
    )
    .orderBy(igInsightsDaily.date);

  return rows.map((r) => ({
    date: r.date,
    reach: r.reach ?? 0,
    profileViews: r.profileViews ?? 0,
    followerCount: r.followerCount ?? 0,
    followersSnapshot: r.followersSnapshot,
  }));
}

export async function getIgTopPosts(opts: { limit?: number } = {}): Promise<IgTopPost[]> {
  const account = await getActiveIgAccount();
  if (!account) return [];

  const rows = await db
    .select({
      mediaId: igMedia.id,
      igMediaId: igMedia.igMediaId,
      type: igMedia.type,
      caption: igMedia.caption,
      permalink: igMedia.permalink,
      thumbnailUrl: igMedia.thumbnailUrl,
      timestamp: igMedia.timestamp,
      reach: igMediaInsights.reach,
      engagement: igMediaInsights.engagement,
      saved: igMediaInsights.saved,
      shares: igMediaInsights.shares,
      engagementRate: igMediaInsights.engagementRate,
    })
    .from(igMedia)
    .leftJoin(igMediaInsights, eq(igMediaInsights.mediaId, igMedia.id))
    .where(eq(igMedia.accountId, account.id))
    .orderBy(desc(igMediaInsights.engagement))
    .limit(opts.limit ?? 12);

  return rows.map((r) => ({
    mediaId: r.mediaId,
    igMediaId: r.igMediaId,
    type: r.type ?? "other",
    caption: r.caption,
    permalink: r.permalink,
    thumbnailUrl: r.thumbnailUrl,
    timestamp: r.timestamp,
    reach: r.reach ?? 0,
    engagement: r.engagement ?? 0,
    saved: r.saved ?? 0,
    shares: r.shares ?? 0,
    engagementRate: r.engagementRate ? Number(r.engagementRate) : 0,
  }));
}
