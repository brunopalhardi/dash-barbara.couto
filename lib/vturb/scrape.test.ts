import { describe, it, expect } from "vitest";
import { normalizePageUrl, extractPlayerIds } from "./scrape";

describe("normalizePageUrl", () => {
  it("tira query string e UTM, mantém host+path", () => {
    expect(normalizePageUrl("https://guia-alzheimer-v1-a1.lovable.app/?utm_content=GA-A2"))
      .toBe("https://guia-alzheimer-v1-a1.lovable.app/");
  });
  it("normaliza barra final e força lowercase no host", () => {
    expect(normalizePageUrl("https://GUIA-X.lovable.app/pagina/"))
      .toBe("https://guia-x.lovable.app/pagina");
    expect(normalizePageUrl("https://guia-x.lovable.app"))
      .toBe("https://guia-x.lovable.app/");
  });
  it("retorna null pra URL inválida", () => {
    expect(normalizePageUrl(null)).toBeNull();
    expect(normalizePageUrl("não-é-url")).toBeNull();
  });
});

describe("extractPlayerIds", () => {
  it("extrai player_id do script converteai", () => {
    const html = `<script src="https://scripts.converteai.net/abc/players/6a13a0b8fdf7a4c849eb57ba/v4/player.js"></script>`;
    expect(extractPlayerIds(html)).toEqual(["6a13a0b8fdf7a4c849eb57ba"]);
  });
  it("extrai do custom element vid-<id>", () => {
    const html = `<vturb-smartplayer id="vid-6a18b5c19cc3b2039d5bd4b8"></vturb-smartplayer>`;
    expect(extractPlayerIds(html)).toEqual(["6a18b5c19cc3b2039d5bd4b8"]);
  });
  it("dedup quando script e element repetem o mesmo id", () => {
    const html = `<vturb-smartplayer id="vid-6a13a0b8fdf7a4c849eb57ba"></vturb-smartplayer>
      <script src="https://scripts.converteai.net/x/players/6a13a0b8fdf7a4c849eb57ba/v4/player.js"></script>`;
    expect(extractPlayerIds(html)).toEqual(["6a13a0b8fdf7a4c849eb57ba"]);
  });
  it("acha 2 players distintos (mobile+desktop)", () => {
    const html = `players/6a18b5c19cc3b2039d5bd4b8/v4 players/6a18b83a5f4238b9b9c8072d/v4`;
    expect(extractPlayerIds(html).sort()).toEqual(
      ["6a18b5c19cc3b2039d5bd4b8", "6a18b83a5f4238b9b9c8072d"].sort());
  });
  it("retorna vazio quando não há embed", () => {
    expect(extractPlayerIds("<html><body>sem player</body></html>")).toEqual([]);
  });
});
