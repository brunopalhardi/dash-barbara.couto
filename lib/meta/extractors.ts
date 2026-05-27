import type { MetaCreative } from "./types";

/**
 * Meta retorna a URL de destino do anúncio em vários lugares diferentes,
 * dependendo do formato do criativo. Tentamos em ordem de prioridade:
 *  1. object_story_spec.link_data.link             (imagem single)
 *  2. object_story_spec.video_data.call_to_action.value.link  (vídeo)
 *  3. object_story_spec.template_data.link         (carousel — link geral)
 *  4. object_story_spec.template_data.call_to_action.value.link (carousel CTA)
 *  5. object_story_spec.template_data.child_attachments[0].link (carousel 1º card)
 *  6. asset_feed_spec.link_urls[0].website_url     (Advantage+ / asset feed)
 *
 * Retorna a primeira string não-vazia ou null.
 */
export function extractLandingUrl(creative: MetaCreative): string | null {
  const oss = creative.object_story_spec;

  const candidates: Array<string | undefined> = [
    oss?.link_data?.link,
    oss?.video_data?.call_to_action?.value?.link,
    oss?.template_data?.link,
    oss?.template_data?.call_to_action?.value?.link,
    oss?.template_data?.child_attachments?.[0]?.link,
    creative.asset_feed_spec?.link_urls?.[0]?.website_url,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}
