/**
 * Extração e classificação do tracking de origem das vendas Hotmart.
 *
 * O sck chega no formato pipe "s=<source>|m=<medium>|c=<campaign>|co=<content>|t=<tipo>"
 * (montado pelos parâmetros de URL dos anúncios Meta e repassado ao checkout).
 * O t= é "pago" nas campanhas atuais, mas em formatos antigos carrega o AD ID.
 * O xcod/external_code traz {vid: <ad_id>, vsrc: "paid_metaads", u: <session>}.
 *
 * Classificação em 3 baldes (decisão Bruno 2026-06-10):
 *   trafego        — evidência de anúncio pago (t=pago, vsrc=paid_*, ad id, s=*Ads*)
 *   organico       — declarado explicitamente (t=organico, s contendo organic/organico)
 *   sem_atribuicao — sem tracking ou tracking não-classificável (visível no dash;
 *                    NUNCA atribuir ao tráfego por padrão — inflaria o CAC)
 */

export type TrafficBucket = "trafego" | "organico" | "sem_atribuicao";

export interface PurchaseTracking {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  /** ad id do Meta (xcod.vid, external_code.vid, ou t= numérico) */
  adExternalId: string | null;
  /** sck/source_sck cru, pra auditoria e reclassificação futura */
  trackingRaw: string | null;
  /** valor do t= (pago | organico | <ad_id> | null) */
  trackingType: string | null;
  /** xcod.vsrc (ex.: paid_metaads) */
  vsrc: string | null;
}

const EMPTY: PurchaseTracking = {
  utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
  adExternalId: null, trackingRaw: null, trackingType: null, vsrc: null,
};

function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Parseia "k=v|k=v" tolerante; retorna null se não for formato pipe. */
function parseSck(sck: string): Map<string, string> | null {
  if (!sck.includes("=") || !sck.includes("|")) return null;
  const map = new Map<string, string>();
  for (const part of sck.split("|")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (k && v) map.set(k, v);
  }
  return map.size > 0 ? map : null;
}

/** xcod pode vir como objeto ou string JSON. */
function parseXcod(v: unknown): { vid?: string; vsrc?: string } {
  let obj = asObj(v);
  if (!obj && typeof v === "string") {
    try {
      obj = asObj(JSON.parse(v));
    } catch {
      return {};
    }
  }
  if (!obj) return {};
  return {
    vid: typeof obj.vid === "string" ? obj.vid : undefined,
    vsrc: typeof obj.vsrc === "string" ? obj.vsrc : undefined,
  };
}

const AD_ID_RE = /^\d{10,}$/;

/** Extrai tracking de um raw_payload (webhook OU item do histórico). */
export function extractTracking(raw: unknown): PurchaseTracking {
  const root = asObj(raw);
  if (!root) return { ...EMPTY };

  // webhook: data.purchase.origin.{sck,xcod} · histórico: purchase.tracking.{source_sck,external_code}
  const origin = asObj(asObj(asObj(root.data)?.purchase)?.origin);
  const tracking = asObj(asObj(root.purchase)?.tracking);

  const sckStr =
    (typeof origin?.sck === "string" && origin.sck) ||
    (typeof tracking?.source_sck === "string" && tracking.source_sck) ||
    null;
  const xcod = parseXcod(origin?.xcod ?? tracking?.external_code);

  const out: PurchaseTracking = { ...EMPTY, trackingRaw: sckStr, vsrc: xcod.vsrc ?? null };

  if (sckStr) {
    const kv = parseSck(sckStr);
    if (kv) {
      out.utmSource = kv.get("s") ?? null;
      out.utmMedium = kv.get("m") ?? null;
      out.utmCampaign = kv.get("c") ?? null;
      out.utmContent = kv.get("co") ?? null;
      out.trackingType = kv.get("t") ?? null;
    }
  }
  // vid do xcod ganha; t= numérico (formato antigo) é fallback
  out.adExternalId =
    xcod.vid ?? (out.trackingType && AD_ID_RE.test(out.trackingType) ? out.trackingType : null);
  return out;
}

/** Classifica nos 3 baldes. Orgânico explícito ganha; depois evidência de pago; resto sem_atribuicao. */
export function classifyTraffic(t: PurchaseTracking): TrafficBucket {
  const ty = t.trackingType?.toLowerCase() ?? "";
  const src = t.utmSource?.toLowerCase() ?? "";

  if (ty === "organico" || ty === "organic") return "organico";
  if (src.includes("organic")) return "organico"; // cobre "organico" e "organic"

  if (ty === "pago") return "trafego";
  if (ty && AD_ID_RE.test(ty)) return "trafego"; // formato antigo: t=<ad_id>
  if (t.vsrc?.toLowerCase().startsWith("paid")) return "trafego";
  if (t.adExternalId) return "trafego";
  if (src.includes("ads")) return "trafego"; // MetaAds_*, GoogleAds_*

  return "sem_atribuicao";
}
