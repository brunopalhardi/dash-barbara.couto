/** URL canônica de uma página: scheme+host(lower)+path, sem query/UTM, sem barra final (exceto raiz). */
export function normalizePageUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    if (path === "") path = "/";
    return `${u.protocol}//${host}${path}`;
  } catch {
    return null;
  }
}

const PLAYER_ID = "[a-f0-9]{24}";
const RE_SCRIPT = new RegExp(`converteai\\.net\\/[^"'\\s]*?\\/players\\/(${PLAYER_ID})`, "gi");
const RE_ELEMENT = new RegExp(`vid[-_](${PLAYER_ID})`, "gi");
const RE_PLAYERS_PATH = new RegExp(`players\\/(${PLAYER_ID})`, "gi");

/** Extrai player_id(s) do HTML cru de uma página com embed VTurb/ConverteAI. */
export function extractPlayerIds(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(RE_SCRIPT)) ids.add(m[1].toLowerCase());
  for (const m of html.matchAll(RE_ELEMENT)) ids.add(m[1].toLowerCase());
  for (const m of html.matchAll(RE_PLAYERS_PATH)) ids.add(m[1].toLowerCase());
  return [...ids];
}
