# Hotmart Sales History Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill histórico de vendas Hotmart (manual `?days=30` + cron diário 24h) reusando `purchases` table, parser e idempotência do webhook.

**Architecture:** 4 módulos isolados em `lib/hotmart/` (oauth, client, parser-history, sync) + 1 endpoint `/api/sync/hotmart` + 1 entry no `vercel.json`. Adapter `parseSalesHistoryItem` converte item da sales-history em envelope `{event, data}` e delega ao `parsePurchasePayload` existente — zero duplicação.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, Vitest, OAuth 2.0 client_credentials.

**Spec:** `docs/superpowers/specs/2026-05-17-hotmart-history-sync-design.md`

---

## File map

- Create: `lib/hotmart/oauth.ts` — `getAccessToken()` com cache module-level
- Create: `lib/hotmart/oauth.test.ts` — mock global `fetch`, cache hit/miss/expire/error
- Create: `lib/hotmart/client.ts` — `fetchSalesHistory({ startDate, endDate })` async generator paginado
- Create: `lib/hotmart/client.test.ts` — mock `fetch`, paginação e retry on 401
- Create: `lib/hotmart/parser-history.ts` — `parseSalesHistoryItem(item)` que delega ao parser do webhook
- Create: `lib/hotmart/parser-history.test.ts` — status mapping (APPROVED/REFUNDED/CHARGEBACK/outros)
- Create: `lib/hotmart/sync.ts` — `syncSalesHistory({ days })` orquestrador, grava em `syncJobs` e `purchases`
- Create: `app/api/sync/hotmart/route.ts` — POST + GET, auth via CRON_SECRET ou Supabase session
- Create: `app/api/sync/hotmart/route.test.ts` — 401, 200 + stats, idempotência via 2 runs
- Modify: `vercel.json` — adicionar cron diário 06h UTC
- Modify: `.env.example` (se existir) — listar HOTMART_CLIENT_ID / HOTMART_CLIENT_SECRET
- Modify: `Secret KEYs/tokens.md` — adicionar nota "agora também na Vercel"

---

## Task 1: OAuth client com cache

**Files:**
- Create: `lib/hotmart/oauth.ts`
- Test: `lib/hotmart/oauth.test.ts`

### Step 1: Write the failing test

`lib/hotmart/oauth.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAccessToken, __resetOAuthCacheForTests } from "./oauth";

const TOKEN_RESPONSE = {
  access_token: "fake-token-xyz",
  expires_in: 86400,
  token_type: "Bearer",
};

beforeEach(() => {
  __resetOAuthCacheForTests();
  process.env.HOTMART_CLIENT_ID = "test-client-id";
  process.env.HOTMART_CLIENT_SECRET = "test-client-secret";
  vi.restoreAllMocks();
});

describe("getAccessToken", () => {
  it("faz request OAuth na primeira chamada e devolve o token", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 }),
    );
    const token = await getAccessToken();
    expect(token).toBe("fake-token-xyz");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("api-sec-vlc.hotmart.com/security/oauth/token");
    expect(String(url)).toContain("grant_type=client_credentials");
    expect(String(url)).toContain("client_id=test-client-id");
    expect((init as RequestInit).method).toBe("POST");
    const auth = (init as RequestInit).headers as Record<string, string>;
    // base64("test-client-id:test-client-secret")
    expect(auth.Authorization).toBe(
      "Basic " + Buffer.from("test-client-id:test-client-secret").toString("base64"),
    );
  });

  it("usa cache na segunda chamada (não chama fetch de novo)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 }),
    );
    await getAccessToken();
    await getAccessToken();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("renova quando o cache está perto da expiração", async () => {
    // expires_in: 30 → cache válido por (30-60)s = expira imediato
    const shortTtl = { ...TOKEN_RESPONSE, expires_in: 30 };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(shortTtl), { status: 200 }),
    );
    await getAccessToken();
    await getAccessToken();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("lança erro com status e body quando OAuth falha", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("invalid_client", { status: 401 }),
    );
    await expect(getAccessToken()).rejects.toThrow(/hotmart oauth.*401.*invalid_client/);
  });

  it("lança erro se HOTMART_CLIENT_ID estiver faltando", async () => {
    delete process.env.HOTMART_CLIENT_ID;
    await expect(getAccessToken()).rejects.toThrow(/HOTMART_CLIENT_ID/);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run lib/hotmart/oauth.test.ts
```

Expected: FAIL with module not found (`./oauth` doesn't exist).

### Step 3: Implement `lib/hotmart/oauth.ts`

```typescript
/**
 * OAuth 2.0 client_credentials pra API REST do Hotmart.
 *
 * Cache module-level do access_token (vale ~24h normalmente). Como Vercel é
 * serverless, cada instance tem o próprio cache — é OK porque a primeira
 * request paga o custo de uma roundtrip OAuth (~200ms) e dali em diante usa
 * cache.
 *
 * Doc: https://developers.hotmart.com/docs/en/v1/oauth/auth/
 */

const TOKEN_URL = "https://api-sec-vlc.hotmart.com/security/oauth/token";
const RENEW_SAFETY_MS = 60_000; // renova 1min antes do expires_in

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cache: CachedToken | null = null;

/** Reseta o cache. Apenas pra uso em testes. */
export function __resetOAuthCacheForTests(): void {
  cache = null;
}

function basicHeader(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && now < cache.expiresAt - RENEW_SAFETY_MS) {
    return cache.token;
  }

  const clientId = process.env.HOTMART_CLIENT_ID;
  const clientSecret = process.env.HOTMART_CLIENT_SECRET;
  if (!clientId) throw new Error("HOTMART_CLIENT_ID não configurado");
  if (!clientSecret) throw new Error("HOTMART_CLIENT_SECRET não configurado");

  const url =
    `${TOKEN_URL}?grant_type=client_credentials` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicHeader(clientId, clientSecret),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`hotmart oauth: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cache = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cache.token;
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run lib/hotmart/oauth.test.ts
```

Expected: PASS (5 tests).

### Step 5: Commit

```bash
git add lib/hotmart/oauth.ts lib/hotmart/oauth.test.ts
git commit -m "feat(hotmart): oauth client_credentials com cache"
```

---

## Task 2: Sales History client (paginado)

**Files:**
- Create: `lib/hotmart/client.ts`
- Test: `lib/hotmart/client.test.ts`

### Step 1: Write the failing test

`lib/hotmart/client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchSalesHistory } from "./client";
import { __resetOAuthCacheForTests } from "./oauth";

const TOKEN_RESPONSE = new Response(
  JSON.stringify({ access_token: "tk-1", expires_in: 86400 }),
  { status: 200 },
);

function pageResponse(items: unknown[], nextPageToken: string | null = null) {
  return new Response(
    JSON.stringify({ items, page_info: { next_page_token: nextPageToken } }),
    { status: 200 },
  );
}

beforeEach(() => {
  __resetOAuthCacheForTests();
  process.env.HOTMART_CLIENT_ID = "id";
  process.env.HOTMART_CLIENT_SECRET = "secret";
  vi.restoreAllMocks();
});

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe("fetchSalesHistory", () => {
  it("retorna lista vazia quando sem itens", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(TOKEN_RESPONSE)
      .mockResolvedValueOnce(pageResponse([]));
    const items = await collect(
      fetchSalesHistory({
        startDate: new Date("2026-05-01T00:00:00Z"),
        endDate: new Date("2026-05-17T00:00:00Z"),
      }),
    );
    expect(items).toEqual([]);
  });

  it("itera 2 páginas e retorna 5 itens no total", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(TOKEN_RESPONSE)
      .mockResolvedValueOnce(pageResponse([{ id: 1 }, { id: 2 }, { id: 3 }], "tok-2"))
      .mockResolvedValueOnce(pageResponse([{ id: 4 }, { id: 5 }]));
    const items = await collect(
      fetchSalesHistory({
        startDate: new Date("2026-05-01T00:00:00Z"),
        endDate: new Date("2026-05-17T00:00:00Z"),
      }),
    );
    expect(items.map((i: { id: number }) => i.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("envia start_date e end_date como epoch ms e Bearer token", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(TOKEN_RESPONSE)
      .mockResolvedValueOnce(pageResponse([]));
    await collect(
      fetchSalesHistory({
        startDate: new Date("2026-05-01T00:00:00Z"),
        endDate: new Date("2026-05-17T00:00:00Z"),
      }),
    );
    // call 0 é o OAuth; call 1 é a sales-history
    const [url, init] = fetchSpy.mock.calls[1];
    expect(String(url)).toContain("developers.hotmart.com/payments/api/v1/sales/history");
    expect(String(url)).toContain(`start_date=${new Date("2026-05-01T00:00:00Z").getTime()}`);
    expect(String(url)).toContain(`end_date=${new Date("2026-05-17T00:00:00Z").getTime()}`);
    expect(String(url)).toContain("max_results=100");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tk-1");
  });

  it("dá uma retentativa quando o primeiro request retorna 401 (token expirou)", async () => {
    // OAuth #1 → sales 401 → OAuth #2 (forçado) → sales 200
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(TOKEN_RESPONSE)
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tk-2", expires_in: 86400 }), { status: 200 }),
      )
      .mockResolvedValueOnce(pageResponse([{ id: 99 }]));
    const items = await collect(
      fetchSalesHistory({
        startDate: new Date("2026-05-01T00:00:00Z"),
        endDate: new Date("2026-05-17T00:00:00Z"),
      }),
    );
    expect(items).toEqual([{ id: 99 }]);
  });

  it("lança erro em status não-200 que não seja 401", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(TOKEN_RESPONSE)
      .mockResolvedValueOnce(new Response("server error", { status: 500 }));
    const iter = fetchSalesHistory({
      startDate: new Date("2026-05-01T00:00:00Z"),
      endDate: new Date("2026-05-17T00:00:00Z"),
    });
    await expect(collect(iter)).rejects.toThrow(/hotmart sales-history.*500.*server error/);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run lib/hotmart/client.test.ts
```

Expected: FAIL with module not found.

### Step 3: Implement `lib/hotmart/client.ts`

```typescript
/**
 * Client da Sales History API do Hotmart.
 *
 * `fetchSalesHistory` é um async generator que pagina internamente até o
 * `next_page_token` vir null. Yield item a item pra não acumular tudo em
 * memória — o consumer decide quando parar.
 *
 * Doc: https://developers.hotmart.com/docs/en/v1/sales/sales-history/
 */
import { getAccessToken, __resetOAuthCacheForTests } from "./oauth";

const BASE_URL = "https://developers.hotmart.com/payments/api/v1/sales/history";
const MAX_RESULTS = 100;

export interface FetchSalesHistoryOptions {
  startDate: Date;
  endDate: Date;
}

interface SalesHistoryPage {
  items: unknown[];
  page_info?: { next_page_token?: string | null };
}

async function fetchPage(
  url: string,
  token: string,
): Promise<{ ok: true; data: SalesHistoryPage } | { ok: false; status: number; body: string }> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    return { ok: false, status: 401, body: "" };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, body };
  }
  return { ok: true, data: (await res.json()) as SalesHistoryPage };
}

function buildUrl(opts: FetchSalesHistoryOptions, pageToken: string | null): string {
  const params = new URLSearchParams({
    start_date: String(opts.startDate.getTime()),
    end_date: String(opts.endDate.getTime()),
    max_results: String(MAX_RESULTS),
  });
  if (pageToken) params.set("page_token", pageToken);
  return `${BASE_URL}?${params.toString()}`;
}

export async function* fetchSalesHistory(
  opts: FetchSalesHistoryOptions,
): AsyncIterable<unknown> {
  let pageToken: string | null = null;
  let retried401 = false;

  do {
    const url = buildUrl(opts, pageToken);
    let token = await getAccessToken();
    let result = await fetchPage(url, token);

    if (!result.ok && result.status === 401 && !retried401) {
      // Token pode ter expirado antes do TTL — força refresh uma vez
      __resetOAuthCacheForTests();
      token = await getAccessToken();
      result = await fetchPage(url, token);
      retried401 = true;
    }

    if (!result.ok) {
      throw new Error(`hotmart sales-history: ${result.status} ${result.body}`);
    }

    for (const item of result.data.items ?? []) {
      yield item;
    }
    pageToken = result.data.page_info?.next_page_token ?? null;
  } while (pageToken);
}
```

**Nota sobre `__resetOAuthCacheForTests`:** foi exposto pelo oauth.ts pra testes. Aqui é usado em produção pra forçar refresh em 401. Como o nome não é ideal, deixamos a nota inline e renomeamos numa eventual revisão futura — funciona idêntico.

### Step 4: Run test to verify it passes

```bash
npx vitest run lib/hotmart/client.test.ts
```

Expected: PASS (5 tests).

### Step 5: Commit

```bash
git add lib/hotmart/client.ts lib/hotmart/client.test.ts
git commit -m "feat(hotmart): sales-history client paginado"
```

---

## Task 3: parser-history adapter

**Files:**
- Create: `lib/hotmart/parser-history.ts`
- Test: `lib/hotmart/parser-history.test.ts`

### Step 1: Write the failing test

`lib/hotmart/parser-history.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseSalesHistoryItem } from "./parser-history";

function makeItem(status: string, overrides: Record<string, unknown> = {}) {
  return {
    product: { id: 1, name: "Desafio 7 Dias Alzheimer" },
    buyer: {
      name: "Maria Silva",
      email: "maria@example.com",
      checkout_phone: "+5511987654321",
    },
    purchase: {
      transaction: "HP-HIST-1",
      approved_date: 1735689600000,
      status,
      price: { value: 197, currency_value: "BRL" },
      ...((overrides.purchase as Record<string, unknown>) ?? {}),
    },
    ...overrides,
  };
}

describe("parseSalesHistoryItem", () => {
  it("status APPROVED → ParsedPurchase com status approved", () => {
    const result = parseSalesHistoryItem(makeItem("APPROVED"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe("approved");
    expect(result!.event).toBe("PURCHASE_APPROVED");
    expect(result!.transactionId).toBe("HP-HIST-1");
    expect(result!.productSlug).toBe("desafio");
    expect(result!.buyerPhoneE164).toBe("5511987654321");
    expect(result!.valueCents).toBe(19700);
  });

  it("status REFUNDED → status refunded", () => {
    expect(parseSalesHistoryItem(makeItem("REFUNDED"))!.status).toBe("refunded");
  });

  it("status CHARGEBACK → status chargeback", () => {
    expect(parseSalesHistoryItem(makeItem("CHARGEBACK"))!.status).toBe("chargeback");
  });

  it("status não suportado retorna null (STARTED, WAITING_PAYMENT, EXPIRED, etc)", () => {
    for (const s of [
      "STARTED",
      "WAITING_PAYMENT",
      "EXPIRED",
      "CANCELED",
      "COMPLETE",
      "DELAYED",
      "NO_FUNDS",
      "OVERDUE",
      "BLOCKED",
      "PROTEST",
      "BILLET_PRINTED",
    ]) {
      expect(parseSalesHistoryItem(makeItem(s))).toBeNull();
    }
  });

  it("aceita status em lowercase ou mixed-case", () => {
    expect(parseSalesHistoryItem(makeItem("approved"))!.status).toBe("approved");
    expect(parseSalesHistoryItem(makeItem("Refunded"))!.status).toBe("refunded");
  });

  it("retorna null pra item sem purchase.status", () => {
    const noStatus = makeItem("APPROVED", {
      purchase: { transaction: "X", approved_date: 1 },
    });
    expect(parseSalesHistoryItem(noStatus)).toBeNull();
  });

  it("retorna null pra entrada inválida (não objeto)", () => {
    expect(parseSalesHistoryItem(null)).toBeNull();
    expect(parseSalesHistoryItem("string")).toBeNull();
    expect(parseSalesHistoryItem(42)).toBeNull();
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run lib/hotmart/parser-history.test.ts
```

Expected: FAIL with module not found.

### Step 3: Implement `lib/hotmart/parser-history.ts`

```typescript
/**
 * Adapter da Sales History API → ParsedPurchase.
 *
 * Items da sales-history têm shape { product, buyer, purchase } SEM um campo
 * `event`. O webhook parser exige `event` (porque ele que define status). Aqui
 * derivamos um `event` sintético a partir de `purchase.status` e delegamos
 * pro parser do webhook — assim toda a extração de buyer/product/price/phone
 * é reusada.
 *
 * Status não-handled (STARTED, WAITING_PAYMENT, etc.) viram null e são
 * ignorados pelo orquestrador.
 */
import { parsePurchasePayload, type ParsedPurchase } from "./parser";

const STATUS_TO_EVENT: Record<string, "PURCHASE_APPROVED" | "PURCHASE_REFUNDED" | "PURCHASE_CHARGEBACK"> = {
  APPROVED: "PURCHASE_APPROVED",
  REFUNDED: "PURCHASE_REFUNDED",
  CHARGEBACK: "PURCHASE_CHARGEBACK",
};

export function parseSalesHistoryItem(item: unknown): ParsedPurchase | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const purchase = (item as { purchase?: unknown }).purchase;
  if (!purchase || typeof purchase !== "object") return null;

  const statusRaw = (purchase as { status?: unknown }).status;
  if (typeof statusRaw !== "string") return null;

  const event = STATUS_TO_EVENT[statusRaw.toUpperCase()];
  if (!event) return null;

  // Delega pro parser do webhook com envelope sintético
  return parsePurchasePayload({ event, data: item });
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run lib/hotmart/parser-history.test.ts
```

Expected: PASS (7 tests).

### Step 5: Commit

```bash
git add lib/hotmart/parser-history.ts lib/hotmart/parser-history.test.ts
git commit -m "feat(hotmart): adapter parser-history reusa parser do webhook"
```

---

## Task 4: Sync orchestrator

**Files:**
- Create: `lib/hotmart/sync.ts`

(Sem teste unitário aqui — coberto pelo route.test.ts da Task 5.)

### Step 1: Implement `lib/hotmart/sync.ts`

```typescript
/**
 * Orquestrador do sync de sales-history.
 *
 * - Cria row em sync_jobs (type=hotmart_replay), marca running.
 * - Calcula janela: now-days*24h-2h overlap → now.
 * - Itera fetchSalesHistory, parseSalesHistoryItem, UPSERT em purchases
 *   (mesma idempotência do webhook via ON CONFLICT transaction_id).
 * - No final, atualiza sync_jobs com stats e marca done/failed.
 */
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { syncJobs } from "@/lib/schema/sync";
import { fetchSalesHistory } from "./client";
import { parseSalesHistoryItem } from "./parser-history";

const OVERLAP_MS = 2 * 60 * 60 * 1000; // 2h

export interface SyncStats {
  jobId: number;
  startDate: string;
  endDate: string;
  processed: number;
  upserted: number;
  skipped: number;
  durationMs: number;
}

async function upsertPurchase(item: unknown, now: Date): Promise<boolean> {
  const parsed = parseSalesHistoryItem(item);
  if (!parsed) return false;

  await db
    .insert(purchases)
    .values({
      transactionId: parsed.transactionId,
      productSlug: parsed.productSlug,
      productNameRaw: parsed.productNameRaw,
      status: parsed.status,
      buyerName: parsed.buyerName,
      buyerEmail: parsed.buyerEmail,
      buyerPhoneRaw: parsed.buyerPhoneRaw,
      buyerPhoneE164: parsed.buyerPhoneE164,
      valueCents: parsed.valueCents,
      currency: parsed.currency,
      purchasedAt: parsed.purchasedAt,
      rawPayload: item as object,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: purchases.transactionId,
      set: {
        status: parsed.status,
        buyerName: sql`coalesce(excluded.buyer_name, ${purchases.buyerName})`,
        buyerEmail: sql`coalesce(excluded.buyer_email, ${purchases.buyerEmail})`,
        buyerPhoneRaw: sql`coalesce(excluded.buyer_phone_raw, ${purchases.buyerPhoneRaw})`,
        buyerPhoneE164: sql`coalesce(excluded.buyer_phone_e164, ${purchases.buyerPhoneE164})`,
        rawPayload: item as object,
        updatedAt: now,
      },
    });
  return true;
}

export async function syncSalesHistory({ days }: { days: number }): Promise<SyncStats> {
  const t0 = Date.now();
  const now = new Date();
  const endDate = now;
  const startDate = new Date(now.getTime() - days * 86_400_000 - OVERLAP_MS);

  const [job] = await db
    .insert(syncJobs)
    .values({
      type: "hotmart_replay",
      status: "running",
      startedAt: now,
      details: { days, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    })
    .returning({ id: syncJobs.id });

  let processed = 0;
  let upserted = 0;
  let skipped = 0;

  try {
    for await (const item of fetchSalesHistory({ startDate, endDate })) {
      processed++;
      const ok = await upsertPurchase(item, now);
      if (ok) upserted++;
      else skipped++;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(syncJobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        rowsProcessed: processed,
        errorMessage: message,
        details: {
          days,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          processed,
          upserted,
          skipped,
        },
      })
      .where(eq(syncJobs.id, job.id));
    throw err;
  }

  const durationMs = Date.now() - t0;
  await db
    .update(syncJobs)
    .set({
      status: "done",
      finishedAt: new Date(),
      rowsProcessed: upserted,
      details: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        processed,
        upserted,
        skipped,
        durationMs,
      },
    })
    .where(eq(syncJobs.id, job.id));

  return {
    jobId: job.id,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    processed,
    upserted,
    skipped,
    durationMs,
  };
}
```

### Step 2: Verify typecheck

```bash
npx tsc --noEmit
```

Expected: 0 errors.

### Step 3: Commit

```bash
git add lib/hotmart/sync.ts
git commit -m "feat(hotmart): sync orchestrator com sync_jobs tracking"
```

---

## Task 5: Endpoint `/api/sync/hotmart` (POST + GET)

**Files:**
- Create: `app/api/sync/hotmart/route.ts`
- Test: `app/api/sync/hotmart/route.test.ts`

### Step 1: Write the failing test

`app/api/sync/hotmart/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "./route";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { syncJobs } from "@/lib/schema/sync";
import { eq } from "drizzle-orm";
import { __resetOAuthCacheForTests } from "@/lib/hotmart/oauth";

const CRON = "test-cron-secret";

const sampleItem = {
  product: { name: "Desafio 7 Dias" },
  buyer: {
    name: "João Histórico",
    email: "joao-hist@test.com",
    checkout_phone: "+5511999991111",
  },
  purchase: {
    transaction: "HP-SYNC-1",
    status: "APPROVED",
    approved_date: Date.now(),
    price: { value: 197, currency_value: "BRL" },
  },
};

const tokenRes = () =>
  new Response(JSON.stringify({ access_token: "tk", expires_in: 86400 }), { status: 200 });
const pageRes = (items: unknown[]) =>
  new Response(
    JSON.stringify({ items, page_info: { next_page_token: null } }),
    { status: 200 },
  );

function buildReq({ days, token }: { days?: number; token?: string | null } = {}) {
  const u = new URL("http://localhost/api/sync/hotmart");
  if (days != null) u.searchParams.set("days", String(days));
  const headers = new Headers();
  if (token !== null) headers.set("authorization", `Bearer ${token ?? CRON}`);
  return new NextRequest(u, { method: "POST", headers });
}

beforeEach(async () => {
  process.env.CRON_SECRET = CRON;
  process.env.HOTMART_CLIENT_ID = "id";
  process.env.HOTMART_CLIENT_SECRET = "secret";
  __resetOAuthCacheForTests();
  vi.restoreAllMocks();
  await db.delete(purchases).where(eq(purchases.transactionId, "HP-SYNC-1"));
  await db.delete(syncJobs).where(eq(syncJobs.type, "hotmart_replay"));
});

describe("POST /api/sync/hotmart", () => {
  it("401 sem CRON_SECRET", async () => {
    const res = await POST(buildReq({ token: null }));
    expect(res.status).toBe(401);
  });

  it("401 com token errado", async () => {
    const res = await POST(buildReq({ token: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("200 + stats com 1 item approved persistido", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(pageRes([sampleItem]));

    const res = await POST(buildReq({ days: 7 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { processed: number; upserted: number; skipped: number };
    expect(json.processed).toBe(1);
    expect(json.upserted).toBe(1);
    expect(json.skipped).toBe(0);

    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-SYNC-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].productSlug).toBe("desafio");
  });

  it("idempotente: 2 runs sequenciais não duplicam linha", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(pageRes([sampleItem]))
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(pageRes([sampleItem]));

    await POST(buildReq({ days: 7 }));
    __resetOAuthCacheForTests();
    await POST(buildReq({ days: 7 }));

    const rows = await db
      .select()
      .from(purchases)
      .where(eq(purchases.transactionId, "HP-SYNC-1"));
    expect(rows).toHaveLength(1);
  });

  it("items com status não suportado contam como skipped", async () => {
    const expired = { ...sampleItem, purchase: { ...sampleItem.purchase, status: "EXPIRED", transaction: "HP-EXP" } };
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(pageRes([expired]));

    const res = await POST(buildReq({ days: 7 }));
    const json = (await res.json()) as { skipped: number; upserted: number };
    expect(json.upserted).toBe(0);
    expect(json.skipped).toBe(1);
  });

  it("default days=1 quando query string ausente", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(pageRes([]));
    const res = await POST(buildReq({}));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { startDate: string; endDate: string };
    const span = new Date(json.endDate).getTime() - new Date(json.startDate).getTime();
    // 1 dia + 2h overlap = 26h, com tolerância de 1min
    expect(span).toBeGreaterThanOrEqual(26 * 3_600_000 - 60_000);
    expect(span).toBeLessThanOrEqual(26 * 3_600_000 + 60_000);
  });

  it("clampa days a 90 (proteção contra timeout)", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(pageRes([]));
    const res = await POST(buildReq({ days: 999 }));
    const json = (await res.json()) as { startDate: string; endDate: string };
    const span = new Date(json.endDate).getTime() - new Date(json.startDate).getTime();
    // 90 dias + 2h overlap
    expect(span).toBeLessThanOrEqual(90 * 86_400_000 + 2 * 3_600_000 + 60_000);
  });
});

describe("GET /api/sync/hotmart", () => {
  it("retorna status simples sem auth", async () => {
    const req = new NextRequest(new URL("http://localhost/api/sync/hotmart"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect((await res.json()).service).toBe("hotmart-sync");
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run app/api/sync/hotmart/route.test.ts
```

Expected: FAIL with module not found.

### Step 3: Implement `app/api/sync/hotmart/route.ts`

```typescript
/**
 * Endpoint do sync de sales-history do Hotmart.
 *
 * POST com auth via CRON_SECRET (header Authorization: Bearer ...) ou
 * sessão Supabase. Aceita ?days=N (default 1, max 90). Roda inline com
 * maxDuration=60s — pra volumes maiores, mover pra Upstash queue depois.
 *
 * GET sem auth devolve status pra healthcheck.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSalesHistory } from "@/lib/hotmart/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_DAYS = 1;
const MAX_DAYS = 90;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

function parseDays(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get("days");
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.min(n, MAX_DAYS);
}

export async function GET(_req: NextRequest) {
  return NextResponse.json({ ok: true, service: "hotmart-sync" });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = parseDays(req);
  try {
    const stats = await syncSalesHistory({ days });
    return NextResponse.json({ ok: true, days, ...stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hotmart-sync] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run app/api/sync/hotmart/route.test.ts
```

Expected: PASS (7 POST tests + 1 GET test = 8 tests).

### Step 5: Full suite check

```bash
npx tsc --noEmit && npm test
```

Expected: tsc clean, all tests pass.

### Step 6: Commit

```bash
git add app/api/sync/hotmart/route.ts app/api/sync/hotmart/route.test.ts
git commit -m "feat(hotmart): endpoint POST /api/sync/hotmart com auth + stats"
```

---

## Task 6: Cron diário Vercel

**Files:**
- Modify: `vercel.json`

### Step 1: Edit `vercel.json`

Substituir conteúdo por:

```json
{
  "crons": [
    {
      "path": "/api/sync/refresh",
      "schedule": "0 5 * * *"
    },
    {
      "path": "/api/sync/hotmart",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Cron Hotmart roda 06h UTC = 03h SP, 1h depois do Meta. Vercel injeta `Authorization: Bearer $CRON_SECRET` automaticamente — `parseDays` sem query retorna default 1 (= últimas 24h + 2h overlap).

### Step 2: Verify JSON sintaticamente

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8'))" && echo OK
```

Expected: `OK`.

### Step 3: Commit

```bash
git add vercel.json
git commit -m "feat(cron): cron diário Hotmart 03h SP (1h após Meta)"
```

---

## Task 7: Bruno cadastra env vars na Vercel + deploy

**(Manual — não é tarefa de código, mas precisa pra prod funcionar.)**

- [ ] **Step 1:** Bruno entra na Vercel → Settings → Environment Variables e adiciona em `Production` (e Preview opcional):
  - `HOTMART_CLIENT_ID` = `6957e7c8-6e97-4c5b-ad8f-0079fb6bf296`
  - `HOTMART_CLIENT_SECRET` = `1e289a17-d197-4d1e-80be-e39f5bf777bf`

- [ ] **Step 2:** Push do branch (cron e endpoint só passam a existir após merge):

```bash
git checkout main
git merge --no-ff feat/hotmart-history-sync -m "Merge branch 'feat/hotmart-history-sync'"
git push origin main
```

(Ou abrir PR — preferência do Bruno.)

- [ ] **Step 3:** Após deploy verde, disparar backfill de 30 dias:

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://dash-traqueamento.vercel.app/api/sync/hotmart?days=30"
```

Esperado: JSON com `processed`, `upserted`, `skipped`, `durationMs`. Se rodar dentro de 60s, deu certo.

- [ ] **Step 4:** Validar visualmente em `/desafio` e `/guia` — a tabela "Compradores do período" deve mostrar as vendas históricas dos últimos 30 dias.

---

## Verificação final

- [ ] **Suite completa de testes**

```bash
npm test
```

Esperado: tudo verde (incluindo 5 + 5 + 7 + 8 = 25 testes novos = ~48 total).

- [ ] **Type-check + lint + build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Esperado: tsc clean, build verde. Lint pode manter 1 warning pré-existente em `cycle-selector.tsx` — ignore.

- [ ] **Verificar que cron está listado**

`npm run build` deve emitir a rota `/api/sync/hotmart` na listagem final. O cron em si só fica ativo após o deploy na Vercel.

---

## Notas pro implementador

- **Ordem das tasks importa:** oauth → client (depende de oauth) → parser-history (depende do parser do webhook que já existe) → sync (depende dos 3) → route (depende de sync) → vercel.json.
- **TDD estrito:** escrever o teste, ver falhar, implementar, ver passar, commitar.
- **Sem helper extraction agora:** o parser-history reusa o parser do webhook via envelope sintético — não duplica nada. Se aparecer 3º consumer dos helpers `asObj/pick/toDate`, aí sim extrair pra `lib/utils/webhook-parse.ts` (follow-up já documentado no CLAUDE.md).
- **Mocking de `fetch`:** uso `vi.spyOn(global, "fetch").mockResolvedValueOnce(...)` por chamada. Cuidar a ordem das chamadas (OAuth vem antes da sales-history em cold cache).
- **Reset do oauth cache em testes:** `__resetOAuthCacheForTests()` no `beforeEach` evita vazamento entre testes.
- **DB connectivity:** os testes do sync hit o DB real (mesmo padrão do webhook test). Se `DATABASE_URL` não estiver em `.env.local`, esses testes falham — flag pro Bruno (mas já está configurado).
