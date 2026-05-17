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
