import { describe, it, expect } from "vitest";
import { buildCampaignRows, type CampaignBreakdownRaw } from "./dashboard";

describe("buildCampaignRows", () => {
  function raw(over: Partial<CampaignBreakdownRaw>): CampaignBreakdownRaw {
    return { campaignId: 1, name: "B-IMERSÃO-VENDAS-Q-V1 CBO", spend: 100, activeCreatives: 2, ...over };
  }

  it("campanha com criativo ativo NÃO é atenção", () => {
    const { rows } = buildCampaignRows([raw({ activeCreatives: 3, spend: 50 })]);
    expect(rows[0].needsAttention).toBe(false);
  });

  it("campanha com gasto e 0 criativos ativos É atenção (só stubs/pausados)", () => {
    const { rows } = buildCampaignRows([raw({ activeCreatives: 0, spend: 80 })]);
    expect(rows[0].needsAttention).toBe(true);
  });

  it("campanha sem gasto e sem criativo NÃO é atenção (não há o que auditar)", () => {
    const { rows } = buildCampaignRows([raw({ activeCreatives: 0, spend: 0 })]);
    expect(rows[0].needsAttention).toBe(false);
  });

  it("total = soma dos gastos e pctOfTotal por linha soma ~1", () => {
    const { total, rows } = buildCampaignRows([
      raw({ campaignId: 1, spend: 75 }),
      raw({ campaignId: 2, spend: 25 }),
    ]);
    expect(total).toBe(100);
    expect(rows.reduce((s, r) => s + r.pctOfTotal, 0)).toBeCloseTo(1, 5);
    expect(rows.find((r) => r.campaignId === 1)!.pctOfTotal).toBeCloseTo(0.75, 5);
  });

  it("lista vazia → total 0 e rows [] (sem divisão por zero)", () => {
    const { total, rows } = buildCampaignRows([]);
    expect(total).toBe(0);
    expect(rows).toEqual([]);
  });

  it("ordena por gasto desc", () => {
    const { rows } = buildCampaignRows([
      raw({ campaignId: 1, spend: 10 }),
      raw({ campaignId: 2, spend: 90 }),
      raw({ campaignId: 3, spend: 40 }),
    ]);
    expect(rows.map((r) => r.campaignId)).toEqual([2, 3, 1]);
  });

  it("total 0 → pctOfTotal 0 em todas as linhas", () => {
    const { rows } = buildCampaignRows([raw({ spend: 0, activeCreatives: 1 })]);
    expect(rows[0].pctOfTotal).toBe(0);
  });
});
