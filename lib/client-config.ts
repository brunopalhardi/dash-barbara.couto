/**
 * ÚNICO arquivo a editar ao clonar o dashboard pra outro cliente
 * (além das env vars — ver .env.example, e HOTMART_PRODUCTS em lib/products.ts).
 *
 * Tudo que é específico do negócio mora aqui: marca, produtos, contas Meta,
 * regex de nomenclatura de campanha, visual. O resto do código lê daqui
 * via lib/products.ts.
 *
 * --- Cliente: Barbara Couto (conta Olinda) ---
 * Foco inicial: Desafio (Imersão 7 dias). Low Ticket e Despertar entram depois.
 */
import type { Product } from "@/lib/products";

/** Slugs dos produtos deste cliente. "geral" é obrigatório. */
export type ProductSlug = "geral" | "desafio";
// Futuro: adicionar "lowticket" | "despertar" aqui + entradas em CLIENT_PRODUCTS.

export const BRAND = {
  /** Iniciais no quadradinho do sidebar */
  initials: "BC",
  name: "Barbara Couto",
  subtitle: "tráfego pago + vendas",
};

export const CLIENT_PRODUCTS: Product[] = [
  {
    slug: "geral",
    label: "Geral",
    shortLabel: "Geral",
    description: "Visão consolidada (todas as contas Meta)",
    metaAccountId: null,
    namePattern: null,
    accent: "violet-500",
    defaultRangeDays: 7,
    href: null,
    tagLabel: "GERAL",
    rail: "bg-muted-foreground/30",
    tagBg: "bg-muted",
    tagText: "text-muted-foreground",
    showInNav: false,
    hasWhatsAppGroup: false,
  },
  {
    slug: "desafio",
    label: "Desafio",
    shortLabel: "Desafio",
    description: "Imersão 7 dias · vendas",
    // Conta de VENDAS. A outra conta (act_1610541399726913) é de seguidores/
    // crescimento de base — entra só no Geral (metaAccountId null), sem produto.
    metaAccountId: "act_1140431247243919",
    // Nomenclatura do cliente: campanhas de venda da Imersão levam a tag
    // IMERSÃO-VENDAS no nome. Regex tolera o acento (IMERSÃO/IMERSAO).
    namePattern: /IMERS[ÃA]O-VENDAS/i,
    accent: "fuchsia-500",
    defaultRangeDays: 7,
    href: "/desafio",
    tagLabel: "VENDAS",
    rail: "bg-pink-500",
    tagBg: "bg-pink-500/15",
    tagText: "text-pink-300",
    navBadge: { text: "ATIVO", tone: "good" },
    showInNav: true,
    // SendFlow ligado 2026-06-19: release "LCP - CAPTAÇÃO"
    // (avfd7ZtxV9z0LLTIWWQs) via SENDFLOW_RELEASE_IDS.
    hasWhatsAppGroup: true,
  },
];

/**
 * Allowlist de contas de anúncio Meta exibidas/sincronizadas.
 *
 * O system user token enxerga TODAS as contas do BM do Bruno (44+, de vários
 * clientes). Aqui restringimos às contas DESTE cliente, por nome. null = sem
 * filtro (mostra todas — usar no OBA, que tem BM próprio).
 *
 * Barbara Couto: contas "Bárbara Couto" (CA01/CA02/CA03, BACKUP, CONTEÚDOS) e
 * "Shiatsu Medicine" (outra marca do cliente). Pega acento e maiúsc/minúsc.
 */
export const META_ACCOUNT_ALLOWLIST: RegExp | null =
  /b[áa]rbara\s+couto|shiatsu\s+medicine/i;

/** true se a conta (pelo nome) pode aparecer/sincronizar neste cliente. */
export function isAllowedMetaAccount(name: string): boolean {
  return META_ACCOUNT_ALLOWLIST === null || META_ACCOUNT_ALLOWLIST.test(name);
}

/**
 * Moeda única de exibição do dash + locale de formatação.
 *
 * Barbara Couto opera multi-moeda: gasto Meta em GBP (contas UK Ltd), vendas
 * Hotmart na moeda de cada comprador (94% EUR, resto CHF/GBP/USD/BRL). Decisão
 * (Olinda, 2026-06-17): mostrar TUDO em EUR. A conversão pra EUR acontece nas
 * queries via FX_TO_EUR (ver lib/queries/fx.ts).
 */
export const DISPLAY_CURRENCY = "EUR";
export const DISPLAY_LOCALE = "pt-PT"; // 1.234,56 €

/**
 * Taxas pra converter cada moeda → EUR (multiplica o valor nativo).
 * ⚠️ Aproximadas (jun/2026) — AJUSTAR com a taxa que a Olinda usa.
 * A que mais importa é GBP (todo o gasto é GBP). As outras são <6% das vendas.
 */
export const FX_TO_EUR: Record<string, number> = {
  EUR: 1,
  GBP: 1.17,
  CHF: 1.05,
  USD: 0.92,
  BRL: 0.18,
};
