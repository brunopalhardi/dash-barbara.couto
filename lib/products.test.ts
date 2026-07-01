import { describe, it, expect } from "vitest";
import { detectProduct, classifyPurchaseProduct } from "./products";

// Catálogo da Bárbara: só "desafio" (conta de vendas) + "geral".
const ACCT_DESAFIO = "act_1140431247243919";
const ACCT_OUTRA = "act_1610541399726913"; // conta de seguidores/base

describe("detectProduct", () => {
  it("IMERSÃO-VENDAS na conta de vendas é desafio", () => {
    expect(detectProduct("B-IMERSÃO-VENDAS-F-LP1", ACCT_DESAFIO)).toBe("desafio");
  });
  it("tolera IMERSAO sem acento", () => {
    expect(detectProduct("B-IMERSAO-VENDAS-ABERTO", ACCT_DESAFIO)).toBe("desafio");
  });
  it("IMERSÃO-VENDAS na conta errada não atribui", () => {
    expect(detectProduct("B-IMERSÃO-VENDAS-F-LP1", ACCT_OUTRA)).toBe("outros");
  });
  it("campanha que não casa o regex cai em outros", () => {
    expect(detectProduct("CRESCIMENTO-SEGUIDORES", ACCT_DESAFIO)).toBe("outros");
  });
});

describe("classifyPurchaseProduct", () => {
  it("ingresso (Imersão 7 dias) pelo id → desafio", () => {
    expect(classifyPurchaseProduct("7206438", "Kit Imersão 7 dias - Cura nas tuas Mãos")).toBe("desafio");
  });
  it("principal Base pelo id → principal_base", () => {
    expect(classifyPurchaseProduct("6886262", "KIT - CURSO SHIATSU MEDICINA")).toBe("principal_base");
  });
  it("principal Profissional pelo id → principal_prof (todos os checkouts do cluster)", () => {
    for (const id of ["6176589", "4396164", "5428090", "5428163", "7377653", "7362920"]) {
      expect(classifyPurchaseProduct(id, "qualquer nome")).toBe("principal_prof");
    }
  });
  it("classifica por nome exato quando o id não vem (histórico)", () => {
    expect(classifyPurchaseProduct(null, "KIT CURSO PROFISSIONAL SHIATSU MEDICINA")).toBe("principal_prof");
  });
  it("NÃO confunde por substring 'shiatsu medicina' — Master cai em outros (regressão)", () => {
    expect(classifyPurchaseProduct("4479740", "Master Shiatsu Medicina")).toBe("outros");
    expect(classifyPurchaseProduct(null, "KIT Prática Intensiva Master")).toBe("outros");
  });
  it("produto desconhecido → outros", () => {
    expect(classifyPurchaseProduct("999", "Produto Random")).toBe("outros");
  });
});
