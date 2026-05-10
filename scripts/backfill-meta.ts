/**
 * Backfill manual de insights do Meta — roda local, sem timeout do Vercel.
 *
 * Uso:
 *   npx tsx scripts/backfill-meta.ts            # mode=backfill (last_30d)
 *   npx tsx scripts/backfill-meta.ts --mode=daily
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createMetaClient } from "../lib/meta/client";
import { syncMeta, type SyncMode } from "../lib/sync/syncMeta";

function parseMode(): SyncMode {
  const arg = process.argv.find((a) => a.startsWith("--mode="));
  if (!arg) return "backfill";
  const v = arg.split("=")[1];
  if (v === "daily" || v === "manual" || v === "backfill") return v;
  throw new Error(`mode inválido: ${v}`);
}

async function main() {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN não definido em .env.local");

  const mode = parseMode();
  const started = Date.now();
  console.log(`[backfill] mode=${mode} started`);

  const client = createMetaClient({
    token,
    graphVersion: process.env.META_GRAPH_VERSION,
  });
  const result = await syncMeta({ mode, client });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[backfill] done in ${elapsed}s — job=${result.jobId} status=${result.status}`);
  for (const r of result.results) {
    if (r.error) {
      console.error(`  account=${r.metaAccountId} ERROR: ${r.error}`);
    } else {
      const rows = Object.entries(r.rowsByTable)
        .map(([t, n]) => `${t}=${n}`)
        .join(" ");
      console.log(`  account=${r.metaAccountId} ${rows}`);
    }
  }
  process.exit(result.status === "done" ? 0 : 1);
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
