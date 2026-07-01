import { describe, it, expect } from "vitest";
import { collectAdminPhones } from "./admins";

describe("collectAdminPhones", () => {
  it("extrai e normaliza os números de admin dos grupos (dedupe)", () => {
    const set = collectAdminPhones([
      { admins: [{ name: "Suporte", number: "351930572743" }, { name: "Barbara", number: "351928455569" }] },
      { admins: [{ name: "Suporte", number: "351930572743" }] }, // dup entre grupos
    ]);
    // normalizePhone prefixa 55 (assume BR) — consistente entre fontes, então
    // o que importa é o set conter os admins normalizados, sem duplicar.
    expect(set.has("55351930572743")).toBe(true);
    expect(set.has("55351928455569")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("tolera grupos sem admins / number nulo", () => {
    const set = collectAdminPhones([
      { admins: null },
      { admins: [] },
      { admins: [{ name: "x", number: null }, { name: "y" }] },
      {},
    ]);
    expect(set.size).toBe(0);
  });

  it("ignora números inválidos (< 10 dígitos)", () => {
    const set = collectAdminPhones([{ admins: [{ name: "z", number: "123" }] }]);
    expect(set.size).toBe(0);
  });
});
