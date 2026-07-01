import { describe, it, expect } from "vitest";
import { parsePurchasePayload } from "./parser";

const samplePayload = {
  event: "PURCHASE_APPROVED",
  data: {
    product: { id: 7206438, name: "Kit Imersão 7 dias - Cura nas tuas Mãos" },
    buyer: {
      name: "Maria Silva",
      email: "maria@example.com",
      checkout_phone: "+55 11 98765-4321",
    },
    purchase: {
      transaction: "HP1234567890",
      status: "APPROVED",
      approved_date: 1735689600000,
      price: { value: 197.0, currency_value: "BRL" },
    },
  },
};

describe("parsePurchasePayload", () => {
  it("extrai campos básicos de um PURCHASE_APPROVED", () => {
    const result = parsePurchasePayload(samplePayload);
    expect(result).not.toBeNull();
    expect(result!.transactionId).toBe("HP1234567890");
    expect(result!.event).toBe("PURCHASE_APPROVED");
    expect(result!.status).toBe("approved");
    expect(result!.buyerName).toBe("Maria Silva");
    expect(result!.buyerEmail).toBe("maria@example.com");
    expect(result!.buyerPhoneRaw).toBe("+55 11 98765-4321");
    expect(result!.buyerPhoneE164).toBe("5511987654321");
    expect(result!.valueCents).toBe(19700);
    expect(result!.currency).toBe("BRL");
    expect(result!.productNameRaw).toBe("Kit Imersão 7 dias - Cura nas tuas Mãos");
    expect(result!.purchasedAt).toBeInstanceOf(Date);
  });

  it("mapeia PURCHASE_REFUNDED pra status refunded", () => {
    const result = parsePurchasePayload({ ...samplePayload, event: "PURCHASE_REFUNDED" });
    expect(result!.status).toBe("refunded");
  });

  it("mapeia PURCHASE_CHARGEBACK pra status chargeback", () => {
    const result = parsePurchasePayload({ ...samplePayload, event: "PURCHASE_CHARGEBACK" });
    expect(result!.status).toBe("chargeback");
  });

  it("retorna null se faltar transaction_id", () => {
    const bad = {
      event: "PURCHASE_APPROVED",
      data: { ...samplePayload.data, purchase: { ...samplePayload.data.purchase, transaction: undefined } },
    };
    expect(parsePurchasePayload(bad)).toBeNull();
  });

  it("aceita event no root e telefone em formato bruto sem +", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: {
        ...samplePayload.data,
        buyer: { ...samplePayload.data.buyer, checkout_phone: "11987654321" },
      },
    });
    expect(result!.buyerPhoneE164).toBe("5511987654321");
  });

  it("classifica o ingresso (Desafio) pelo id do produto", () => {
    const result = parsePurchasePayload(samplePayload);
    expect(result!.productSlug).toBe("desafio");
  });

  it("classifica o produto principal Profissional pelo id", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: {
        ...samplePayload.data,
        product: { id: 6176589, name: "KIT CURSO PROFISSIONAL SHIATSU MEDICINA" },
      },
    });
    expect(result!.productSlug).toBe("principal_prof");
  });

  it("classifica por nome exato quando o id não vem no payload (histórico)", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: {
        ...samplePayload.data,
        product: { name: "KIT - CURSO SHIATSU MEDICINA" },
      },
    });
    expect(result!.productSlug).toBe("principal_base");
  });

  it("NÃO confunde por substring 'shiatsu medicina' — Master cai em outros (regressão)", () => {
    for (const name of [
      "Master Shiatsu Medicina",
      "KIT Prática Intensiva Master",
    ]) {
      const result = parsePurchasePayload({
        ...samplePayload,
        data: { ...samplePayload.data, product: { name } },
      });
      expect(result!.productSlug).toBe("outros");
    }
  });

  it("retorna 'outros' quando produto não casa", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: { ...samplePayload.data, product: { id: 999, name: "Produto Random" } },
    });
    expect(result!.productSlug).toBe("outros");
  });

  it("sem tracking no payload → sem_atribuicao com utm_* nulos", () => {
    const result = parsePurchasePayload(samplePayload);
    expect(result!.trafficSource).toBe("sem_atribuicao");
    expect(result!.utmSource).toBeNull();
    expect(result!.utmMedium).toBeNull();
    expect(result!.utmCampaign).toBeNull();
    expect(result!.utmContent).toBeNull();
    expect(result!.adExternalId).toBeNull();
    expect(result!.trackingRaw).toBeNull();
  });

  it("extrai tracking de origin.sck do webhook (pago)", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: {
        ...samplePayload.data,
        purchase: {
          ...samplePayload.data.purchase,
          origin: { sck: "s=MetaAds_OBA|m=Instagram|c=Desafio7D|co=Reels|t=pago" },
        },
      },
    });
    expect(result!.trafficSource).toBe("trafego");
    expect(result!.utmSource).toBe("MetaAds_OBA");
    expect(result!.utmMedium).toBe("Instagram");
    expect(result!.utmCampaign).toBe("Desafio7D");
    expect(result!.utmContent).toBe("Reels");
    expect(result!.trackingRaw).toBe(
      "s=MetaAds_OBA|m=Instagram|c=Desafio7D|co=Reels|t=pago",
    );
  });
});
