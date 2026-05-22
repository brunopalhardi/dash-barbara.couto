/**
 * Client REST do SendFlow (https://sendflow.pro/sendapi).
 *
 * Auth: Authorization: Bearer <SENDFLOW_TOKEN>.
 *
 * Endpoints usados:
 *   GET /releases                        → lista campanhas
 *   GET /releases/{id}/groups            → grupos da campanha
 *   GET /releases/{id}/analytics         → adds/removes/clicks por data
 *   (GET /releases/{id}/leadscoring devolve {success:true} sem dados pra
 *    releases novas — não usamos ainda)
 *
 * Rate limit: SendFlow retorna 403 com {code:"rate-limit-exceeded",
 * retryAfterMs:60000} quando estoura. Cliente respeita Retry-After e
 * retenta uma vez.
 */

const BASE_URL = "https://sendflow.pro/sendapi";
const FETCH_TIMEOUT_MS = 30_000;

export interface SendflowRelease {
  id: string;
  name: string;
  slug?: string;
  archived?: boolean;
  // Campos extras (admins, group config) — preservados em raw_payload
  [key: string]: unknown;
}

export interface SendflowGroup {
  id: string;
  name?: string;
  gid?: string;
  jid?: string;
  inviteCode?: string;
  full?: boolean;
  participantsAmount?: number;
  count?: number;
  admins?: Array<{ name?: string; number?: string }>;
}

export interface SendflowAnalytics {
  add?: { total?: number; dates?: Record<string, number> };
  remove?: { total?: number; dates?: Record<string, number> };
  clicks?: { total?: number; dates?: Record<string, number> };
}

export class SendflowApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
    this.name = "SendflowApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function request<T>(path: string, token: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  // 1 retry com backoff se rate limit
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) return (await res.json()) as T;

    const body = await res.text().catch(() => "");
    let parsed: { code?: string; retryAfterMs?: number } | null = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* não-json */
    }

    // Rate limit explícito → espera e retenta
    if (
      res.status === 403 &&
      parsed?.code === "rate-limit-exceeded" &&
      attempt === 0
    ) {
      const wait = Math.min(parsed.retryAfterMs ?? 60_000, 75_000);
      console.warn(
        `[sendflow] rate-limit em ${path}, aguardando ${wait}ms antes do retry`,
      );
      await sleep(wait);
      continue;
    }

    throw new SendflowApiError(
      `sendflow ${path}: ${res.status} ${body.slice(0, 200)}`,
      res.status,
      parsed,
    );
  }
  throw new SendflowApiError(`sendflow ${path}: retries exhausted`, 0);
}

export interface SendflowLeadscoreRow {
  rank: number;
  phone: string;
  score: number;
}

export interface SendflowClient {
  getReleases(): Promise<SendflowRelease[]>;
  getGroups(releaseId: string): Promise<SendflowGroup[]>;
  getAnalytics(releaseId: string): Promise<SendflowAnalytics>;
  /**
   * Devolve leadscoring agregado (rank + score por telefone). 2 hops:
   * primeiro GET /leadscoring/download retorna URL Firebase, depois GET
   * nessa URL traz o CSV. Retorna [] se release não tem leadscoring.
   *
   * Rate limit MUITO apertado (~10min). Usar com moderação.
   */
  getLeadscoring(releaseId: string): Promise<SendflowLeadscoreRow[]>;
}

function parseLeadscoringCsv(text: string): SendflowLeadscoreRow[] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const out: SendflowLeadscoreRow[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(";");
    if (parts.length < 3) continue;
    const rank = Number(parts[0]);
    const phone = parts[1].trim();
    const score = Number(parts[2]);
    if (!Number.isFinite(rank) || !phone || !Number.isFinite(score)) continue;
    out.push({ rank, phone, score });
  }
  return out;
}

export function createSendflowClient(token: string): SendflowClient {
  return {
    getReleases: () => request<SendflowRelease[]>("/releases", token),
    getGroups: (releaseId) =>
      request<SendflowGroup[]>(`/releases/${releaseId}/groups`, token),
    getAnalytics: (releaseId) =>
      request<SendflowAnalytics>(`/releases/${releaseId}/analytics`, token),
    getLeadscoring: async (releaseId) => {
      // 1) Pede a URL Firebase
      const urlRes = await fetch(
        `${BASE_URL}/releases/${releaseId}/leadscoring/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
      );
      if (!urlRes.ok) {
        const body = await urlRes.text().catch(() => "");
        throw new SendflowApiError(
          `sendflow leadscoring/download ${releaseId}: ${urlRes.status} ${body.slice(0, 200)}`,
          urlRes.status,
        );
      }
      const firebaseUrl = (await urlRes.text()).trim();
      if (!firebaseUrl.startsWith("http")) return [];
      // 2) Baixa o CSV
      const csvRes = await fetch(firebaseUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!csvRes.ok) {
        throw new SendflowApiError(
          `firebase leadscoring csv: ${csvRes.status}`,
          csvRes.status,
        );
      }
      return parseLeadscoringCsv(await csvRes.text());
    },
  };
}

/**
 * Parsa data SendFlow "DDMMYYYY" (sem separadores) pra "YYYY-MM-DD".
 * Retorna null pra strings inválidas.
 */
export function parseSendflowDate(s: string): string | null {
  if (!/^\d{8}$/.test(s)) return null;
  const day = s.slice(0, 2);
  const month = s.slice(2, 4);
  const year = s.slice(4, 8);
  return `${year}-${month}-${day}`;
}
