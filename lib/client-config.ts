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
    // O Desafio da Barbara roda grupo de WhatsApp (SendFlow)? Hoje: não.
    // Vira true quando ligarmos o SendFlow deles.
    hasWhatsAppGroup: false,
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
