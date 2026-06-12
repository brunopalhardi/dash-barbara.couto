import { describe, it, expect } from "vitest";
import { extractTracking, classifyTraffic, type PurchaseTracking } from "./tracking";

const SCK_PAGO =
  "s=MetaAds_Instagram_Feed|m=01-GA-GRUPO-1-EXAUSTÃO-C|c=B-PERPETUO-GA-GRUPO-EXAUSTÃO-C|co=ADGA-VD-EXAUSTÃO-01_C|t=pago";

describe("extractTracking — webhook (data.purchase.origin)", () => {
  it("extrai s/m/c/co/t do sck e vid do xcod", () => {
    const raw = {
      data: {
        purchase: {
          origin: {
            sck: SCK_PAGO,
            xcod: { co: "ADGA-VD-EXAUSTÃO-01_C", vid: "120246037789890453", vsrc: "paid_metaads", u: "abc" },
          },
        },
      },
    };
    const t = extractTracking(raw);
    expect(t.utmSource).toBe("MetaAds_Instagram_Feed");
    expect(t.utmMedium).toBe("01-GA-GRUPO-1-EXAUSTÃO-C");
    expect(t.utmCampaign).toBe("B-PERPETUO-GA-GRUPO-EXAUSTÃO-C");
    expect(t.utmContent).toBe("ADGA-VD-EXAUSTÃO-01_C");
    expect(t.adExternalId).toBe("120246037789890453");
    expect(t.trackingRaw).toBe(SCK_PAGO);
  });
  it("xcod como string JSON também funciona", () => {
    const raw = {
      data: { purchase: { origin: { sck: SCK_PAGO, xcod: '{"vid":"120246037789890453","vsrc":"paid_metaads"}' } } },
    };
    expect(extractTracking(raw).adExternalId).toBe("120246037789890453");
  });
});

describe("extractTracking — histórico (purchase.tracking)", () => {
  it("usa source_sck e external_code", () => {
    const raw = {
      purchase: {
        tracking: {
          source_sck: SCK_PAGO,
          external_code: '{"u":"x","vid":"120244742027820401"}',
        },
      },
    };
    const t = extractTracking(raw);
    expect(t.utmCampaign).toBe("B-PERPETUO-GA-GRUPO-EXAUSTÃO-C");
    expect(t.adExternalId).toBe("120244742027820401");
  });
  it("t= com AD ID (formato antigo) vira adExternalId fallback", () => {
    const raw = {
      purchase: { tracking: { source_sck: "s=MetaAds_Feed|c=CAMP-X|t=120244742027820401" } },
    };
    const t = extractTracking(raw);
    expect(t.adExternalId).toBe("120244742027820401");
  });
});

describe("extractTracking — payloads sem tracking", () => {
  it("payload sem nada retorna campos null", () => {
    const t = extractTracking({ data: { purchase: {} } });
    expect(t.utmSource).toBeNull();
    expect(t.trackingRaw).toBeNull();
  });
  it("formatos não-pipe são preservados em trackingRaw mas não parseiam UTM", () => {
    const raw = { purchase: { tracking: { source_sck: "NEW_CLUB_SALES_PAGE_FROM_SHOWCASE_C" } } };
    const t = extractTracking(raw);
    expect(t.trackingRaw).toBe("NEW_CLUB_SALES_PAGE_FROM_SHOWCASE_C");
    expect(t.utmSource).toBeNull();
  });
});

describe("classifyTraffic — 3 baldes", () => {
  const base: PurchaseTracking = {
    utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
    adExternalId: null, trackingRaw: null, trackingType: null, vsrc: null,
  };
  it("t=pago → trafego", () => {
    expect(classifyTraffic({ ...base, trackingType: "pago" })).toBe("trafego");
  });
  it("vsrc paid_* → trafego", () => {
    expect(classifyTraffic({ ...base, vsrc: "paid_metaads" })).toBe("trafego");
  });
  it("t= com ad id → trafego (veio de anúncio)", () => {
    expect(classifyTraffic({ ...base, trackingType: "120244742027820401" })).toBe("trafego");
  });
  it("s= contendo MetaAds → trafego", () => {
    expect(classifyTraffic({ ...base, utmSource: "MetaAds_Instagram_Feed" })).toBe("trafego");
  });
  it("organico explícito → organico (em t= ou s=)", () => {
    expect(classifyTraffic({ ...base, trackingType: "organico" })).toBe("organico");
    expect(classifyTraffic({ ...base, utmSource: "Organico_Bio" })).toBe("organico");
    expect(classifyTraffic({ ...base, utmSource: "organic" })).toBe("organico");
  });
  it("organico GANHA de s= pago quando t=organico (t é a intenção explícita)", () => {
    expect(classifyTraffic({ ...base, utmSource: "MetaAds_Feed", trackingType: "organico" })).toBe("organico");
  });
  it("sem nada → sem_atribuicao", () => {
    expect(classifyTraffic(base)).toBe("sem_atribuicao");
  });
  it("tracking não-classificável → sem_atribuicao", () => {
    expect(classifyTraffic({ ...base, trackingRaw: "NEW_CLUB_SALES_PAGE_FROM_SHOWCASE_C" })).toBe("sem_atribuicao");
  });
});
