import { describe, it, expect } from "vitest";
import { syncMeta, extractConversions, computeSyncStatus, planStubEntities } from "./syncMeta";
import type { MetaInsight } from "../meta/types";

describe("syncMeta", () => {
  it("exports a function", () => {
    expect(typeof syncMeta).toBe("function");
  });
});

describe("planStubEntities", () => {
  // Insight de anúncio PAUSADO/DELETADO que gastou no período. O Meta filtra
  // esses fora dos endpoints de entidades (effective_status=ACTIVE), então o
  // gasto deles era descartado e o dash ficava ~22% abaixo do Gerenciador.
  // planStubEntities descobre o que falta pra recriar como stub e somar o gasto.
  function insight(over: Partial<MetaInsight>): MetaInsight {
    return {
      ad_id: "ad_1",
      campaign_id: "camp_1",
      campaign_name: "B-IMERSÃO-VENDAS-Q-V1 CBO",
      adset_id: "adset_1",
      adset_name: "conjunto 1",
      ad_name: "anúncio pausado 1",
      date_start: "2026-06-17",
      date_stop: "2026-06-17",
      spend: "10.00",
      ...over,
    };
  }

  const nada = { campaignIds: new Set<string>(), adsetIds: new Set<string>(), adIds: new Set<string>() };

  it("planeja stub de campanha/adset/anúncio quando nada é conhecido", () => {
    const plan = planStubEntities([insight({})], nada);
    expect(plan.campaigns).toEqual([{ metaId: "camp_1", name: "B-IMERSÃO-VENDAS-Q-V1 CBO" }]);
    expect(plan.adsets).toEqual([{ metaId: "adset_1", name: "conjunto 1", campaignMetaId: "camp_1" }]);
    expect(plan.ads).toEqual([{ metaId: "ad_1", name: "anúncio pausado 1", adsetMetaId: "adset_1" }]);
  });

  it("NÃO planeja nada quando o anúncio já é conhecido", () => {
    const known = {
      campaignIds: new Set(["camp_1"]),
      adsetIds: new Set(["adset_1"]),
      adIds: new Set(["ad_1"]),
    };
    const plan = planStubEntities([insight({})], known);
    expect(plan.campaigns).toEqual([]);
    expect(plan.adsets).toEqual([]);
    expect(plan.ads).toEqual([]);
  });

  it("campanha/adset conhecidos mas anúncio novo → só stub do anúncio", () => {
    const known = {
      campaignIds: new Set(["camp_1"]),
      adsetIds: new Set(["adset_1"]),
      adIds: new Set<string>(),
    };
    const plan = planStubEntities([insight({ ad_id: "ad_novo" })], known);
    expect(plan.campaigns).toEqual([]);
    expect(plan.adsets).toEqual([]);
    expect(plan.ads).toEqual([{ metaId: "ad_novo", name: "anúncio pausado 1", adsetMetaId: "adset_1" }]);
  });

  it("deduplica: várias linhas (dias) do mesmo anúncio viram 1 stub", () => {
    const plan = planStubEntities(
      [insight({ date_start: "2026-06-17" }), insight({ date_start: "2026-06-18" })],
      nada,
    );
    expect(plan.campaigns).toHaveLength(1);
    expect(plan.adsets).toHaveLength(1);
    expect(plan.ads).toHaveLength(1);
  });

  it("ignora insight sem adset_id/campaign_id (não dá pra atribuir)", () => {
    const plan = planStubEntities(
      [insight({ ad_id: "ad_x", adset_id: undefined, campaign_id: undefined })],
      nada,
    );
    expect(plan.ads).toEqual([]);
    expect(plan.adsets).toEqual([]);
    expect(plan.campaigns).toEqual([]);
  });
});

describe("computeSyncStatus", () => {
  it("retorna 'partial' quando 1 conta falha e outra tem sucesso", () => {
    // Antes esse cenário virava "done" silenciosamente, mentindo sobre o sucesso.
    expect(
      computeSyncStatus([{ error: "meta auth error" }, { error: undefined }]),
    ).toBe("partial");
  });

  it("retorna 'failed' quando TODAS as contas falham", () => {
    expect(computeSyncStatus([{ error: "x" }, { error: "y" }])).toBe("failed");
  });

  it("retorna 'done' quando nenhuma conta falha", () => {
    expect(computeSyncStatus([{ error: undefined }, { error: undefined }])).toBe("done");
  });

  it("retorna 'done' quando não há contas (lista vazia)", () => {
    expect(computeSyncStatus([])).toBe("done");
  });
});

describe("extractConversions", () => {
  function insight(actions: { action_type: string; value: string }[]): MetaInsight {
    return {
      ad_id: "1",
      date_start: "2026-05-26",
      date_stop: "2026-05-26",
      actions,
    };
  }

  it("extrai landing_page_view do action_type nativo", () => {
    const c = extractConversions(
      insight([{ action_type: "landing_page_view", value: "144" }]),
    );
    expect(c.landing_page_view).toBe(144);
  });

  it("ignora fb_pixel_view_content (ViewContent é evento distinto de LPV)", () => {
    // Validado contra Looker Studio: incluir view_content inflava o número
    // (260 vs 144 esperado em 2026-05-26 no /guia).
    const c = extractConversions(
      insight([{ action_type: "offsite_conversion.fb_pixel_view_content", value: "97" }]),
    );
    expect(c.landing_page_view).toBe(0);
  });

  it("extrai initiate_checkout escolhendo omni quando disponível (sem somar duplicadas)", () => {
    const c = extractConversions(
      insight([
        { action_type: "omni_initiated_checkout", value: "8" },
        { action_type: "offsite_conversion.fb_pixel_initiate_checkout", value: "8" },
        { action_type: "initiate_checkout", value: "8" },
      ]),
    );
    expect(c.initiate_checkout).toBe(8);
  });

  it("usa fallback de prioridade quando omni_initiated_checkout não está presente", () => {
    const c = extractConversions(
      insight([
        { action_type: "offsite_conversion.fb_pixel_initiate_checkout", value: "4" },
      ]),
    );
    expect(c.initiate_checkout).toBe(4);
  });

  it("retorna 0 para landing_page_view e initiate_checkout quando ausentes", () => {
    const c = extractConversions(insight([{ action_type: "lead", value: "5" }]));
    expect(c.landing_page_view).toBe(0);
    expect(c.initiate_checkout).toBe(0);
    expect(c.lead).toBe(5);
  });

  it("preserva chaves existentes (purchase, lead, revenue) ao adicionar novas", () => {
    const c = extractConversions({
      ad_id: "1",
      date_start: "2026-05-26",
      date_stop: "2026-05-26",
      actions: [
        { action_type: "lead", value: "10" },
        { action_type: "omni_purchase", value: "2" },
        { action_type: "landing_page_view", value: "144" },
        { action_type: "omni_initiated_checkout", value: "8" },
      ],
      action_values: [{ action_type: "omni_purchase", value: "397.00" }],
    });
    expect(c).toMatchObject({
      lead: 10,
      purchase: 2,
      revenue: 397,
      landing_page_view: 144,
      initiate_checkout: 8,
    });
  });
});
