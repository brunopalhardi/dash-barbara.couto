/**
 * Cliente da Graph API do Instagram (v25.0). Reaproveita a estratégia
 * de retry/auth do cliente Meta Ads, mas com endpoints e shapes próprios.
 *
 * O token precisa ter pelo menos: instagram_basic, instagram_manage_insights,
 * pages_read_engagement, pages_show_list.
 */
import { MetaApiError, MetaAuthError, MetaRateLimitError } from "@/lib/meta/errors";
import type {
  IgAccountProfile,
  IgInsightItem,
  IgListResponse,
  IgMedia,
} from "./types";

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const RATE_LIMIT_CODES = new Set([4, 17, 32, 80000, 80001, 80002, 80003, 80004, 80014]);
const AUTH_ERROR_CODES = new Set([102, 190, 200, 459, 463, 464, 467]);

export interface InstagramClient {
  getAccount(igUserId: string): Promise<IgAccountProfile>;
  /** Insights agregados por dia (reach, profile_views, follower_count, …) */
  getDailyAccountInsights(opts: {
    igUserId: string;
    metrics: string[];
    since: number; // unix seconds
    until: number; // unix seconds
  }): Promise<IgInsightItem[]>;
  getMedia(igUserId: string, opts?: { limit?: number }): Promise<IgMedia[]>;
  getMediaInsights(mediaId: string, metrics: string[]): Promise<IgInsightItem[]>;
}

export interface InstagramClientConfig {
  token: string;
  graphVersion?: string;
  sleep?: (ms: number) => Promise<void>;
}

export function createInstagramClient(cfg: InstagramClientConfig): InstagramClient {
  const version = cfg.graphVersion ?? "v25.0";
  const sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const base = `https://graph.facebook.com/${version}`;

  async function requestUrl<T>(absoluteUrl: string): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const res = await fetch(absoluteUrl, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      if (res.ok) return body as T;

      const errPayload = (body as { error?: { code?: number; message?: string } } | undefined)?.error;
      const code = errPayload?.code;
      const message = errPayload?.message ?? `HTTP ${res.status}`;

      if (code && AUTH_ERROR_CODES.has(code)) {
        throw new MetaAuthError(message, code, body);
      }
      const retriable =
        res.status === 429 ||
        res.status >= 500 ||
        (code !== undefined && RATE_LIMIT_CODES.has(code));
      if (retriable && attempt < RETRY_DELAYS_MS.length) {
        lastErr = new MetaRateLimitError(message, body);
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (retriable) throw new MetaRateLimitError(message, body);
      throw new MetaApiError(message, code, undefined, res.status, body);
    }
    throw (lastErr ?? new MetaApiError("unknown error"));
  }

  async function request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return requestUrl<T>(url.toString());
  }

  async function paginate<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    const firstUrl = new URL(base + path);
    for (const [k, v] of Object.entries(params)) firstUrl.searchParams.set(k, v);
    let nextUrl: string | undefined = firstUrl.toString();
    while (nextUrl) {
      const page: IgListResponse<T> = await requestUrl<IgListResponse<T>>(nextUrl);
      out.push(...page.data);
      nextUrl = page.paging?.next;
    }
    return out;
  }

  return {
    getAccount: (igUserId) =>
      request<IgAccountProfile>(`/${igUserId}`, {
        fields:
          "id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count",
      }),

    getDailyAccountInsights: async (opts) => {
      const params: Record<string, string> = {
        metric: opts.metrics.join(","),
        period: "day",
        since: String(opts.since),
        until: String(opts.until),
      };
      // Algumas métricas exigem metric_type=total_value (reach v25). Tentamos
      // primeiro o formato simples; se Meta rejeitar, o retry abaixo cuida.
      const res = await request<IgListResponse<IgInsightItem>>(
        `/${opts.igUserId}/insights`,
        params,
      );
      return res.data;
    },

    getMedia: (igUserId, opts = {}) =>
      paginate<IgMedia>(`/${igUserId}/media`, {
        fields:
          "id,media_type,media_product_type,caption,permalink,media_url,thumbnail_url,timestamp,like_count,comments_count",
        limit: String(opts.limit ?? 50),
      }),

    getMediaInsights: async (mediaId, metrics) => {
      const res = await request<IgListResponse<IgInsightItem>>(
        `/${mediaId}/insights`,
        { metric: metrics.join(",") },
      );
      return res.data;
    },
  };
}
