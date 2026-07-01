/**
 * Sync incremental SendFlow → DB.
 *
 *   1. GET /releases — upsert sendflow_releases (preserva manual data)
 *   2. Pra cada release:
 *      - GET /releases/{id}/groups — upsert whatsapp_groups (preenche
 *        participants_amount, full, invite_code, wa_jid, release_id;
 *        preserva product_slug/cycle_label que Bruno seta manualmente)
 *      - GET /releases/{id}/analytics — upsert sendflow_analytics_daily
 *        com adds/removals/clicks por data
 *
 * Throttle: 1500ms entre calls — SendFlow rate-limita agressivamente
 * (~1 call por minuto, confirmado empiricamente em 2026-05-21). O client
 * (lib/sendflow/client) já retenta em rate-limit-exceeded com Retry-After
 * de 60s, mas espalhar as calls reduz o número de retries necessários.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappGroups } from "@/lib/schema/whatsapp";
import {
  sendflowReleases,
  sendflowAnalyticsDaily,
  sendflowLeadscoring,
} from "@/lib/schema/sendflow";
import { syncJobs } from "@/lib/schema/sync";
import {
  createSendflowClient,
  parseSendflowDate,
  type SendflowAnalytics,
  type SendflowGroup,
} from "./client";
import { normalizePhone } from "@/lib/utils/phone";
import { isAdminPhone, collectAdminPhones } from "./admins";

const THROTTLE_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface SendflowSyncStats {
  jobId: number;
  releases: number;
  groups: number;
  analyticsRows: number;
  leadscoringRows: number;
  durationMs: number;
}

interface SyncOpts {
  token: string;
  /**
   * Lista de external_ids de releases a sincronizar. Se vazio, sincroniza
   * todos. Bruno só quer a release de CAPTAÇÃO do Desafio — passar via
   * env SENDFLOW_RELEASE_IDS (comma-separated) ou direto via param aqui.
   */
  releaseIdsWhitelist?: string[];
}

export async function syncSendflow(opts: SyncOpts): Promise<SendflowSyncStats> {
  const t0 = Date.now();
  const now = new Date();
  const client = createSendflowClient(opts.token);
  const whitelist = new Set(opts.releaseIdsWhitelist ?? []);

  const [job] = await db
    .insert(syncJobs)
    .values({ type: "sendflow_sync", status: "running", startedAt: now })
    .returning({ id: syncJobs.id });

  let releaseCount = 0;
  let groupCount = 0;
  let analyticsRows = 0;
  let leadscoringRows = 0;

  try {
    const apiReleases = await client.getReleases();
    await sleep(THROTTLE_MS);

    const filteredReleases = whitelist.size > 0
      ? apiReleases.filter((r) => whitelist.has(r.id))
      : apiReleases;

    for (const r of filteredReleases) {
      // Upsert release
      const [{ id: releaseDbId }] = await db
        .insert(sendflowReleases)
        .values({
          externalId: r.id,
          name: r.name,
          slug: (r.slug as string | undefined) ?? null,
          archived: Boolean(r.archived),
          rawPayload: r as Record<string, unknown>,
          lastSyncedAt: now,
        })
        .onConflictDoUpdate({
          target: sendflowReleases.externalId,
          set: {
            name: r.name,
            slug: (r.slug as string | undefined) ?? null,
            archived: Boolean(r.archived),
            rawPayload: r as Record<string, unknown>,
            lastSyncedAt: now,
            updatedAt: now,
          },
        })
        .returning({ id: sendflowReleases.id });
      releaseCount++;

      // Groups
      let apiGroups: SendflowGroup[] = [];
      try {
        apiGroups = await client.getGroups(r.id);
      } catch (err) {
        console.warn(`[sendflow-sync] getGroups(${r.id}) falhou:`, err);
      }
      await sleep(THROTTLE_MS);

      for (const g of apiGroups) {
        // external_id = ID interno SendFlow do GRUPO (não do release).
        // Webhook usa esse mesmo ID pra eventos, então bate.
        await db
          .insert(whatsappGroups)
          .values({
            externalId: g.id,
            name: g.name ?? null,
            sendflowReleaseExternalId: r.id,
            waJid: g.jid ?? g.gid ?? null,
            inviteCode: g.inviteCode ?? null,
            participantsAmount: g.participantsAmount ?? null,
            isFull: g.full ?? null,
            admins: g.admins ?? null,
          })
          .onConflictDoUpdate({
            target: whatsappGroups.externalId,
            set: {
              // Atualiza só campos do REST — NÃO toca em product_slug/cycle_label
              // que Bruno seta manualmente via SQL.
              name: g.name ?? sql`${whatsappGroups.name}`,
              sendflowReleaseExternalId: r.id,
              waJid: g.jid ?? g.gid ?? null,
              inviteCode: g.inviteCode ?? null,
              participantsAmount: g.participantsAmount ?? null,
              isFull: g.full ?? null,
              admins: g.admins ?? null,
              updatedAt: now,
            },
          });
        groupCount++;
      }

      // Analytics
      let analytics: SendflowAnalytics | null = null;
      try {
        analytics = await client.getAnalytics(r.id);
      } catch (err) {
        console.warn(`[sendflow-sync] getAnalytics(${r.id}) falhou:`, err);
      }
      await sleep(THROTTLE_MS);

      if (analytics) {
        // Une todas as datas que aparecem em qualquer um dos 3 buckets
        const addDates = analytics.add?.dates ?? {};
        const removeDates = analytics.remove?.dates ?? {};
        const clickDates = analytics.clicks?.dates ?? {};
        const allDates = new Set([
          ...Object.keys(addDates),
          ...Object.keys(removeDates),
          ...Object.keys(clickDates),
        ]);

        for (const ddmmyyyy of allDates) {
          const date = parseSendflowDate(ddmmyyyy);
          if (!date) continue;
          await db
            .insert(sendflowAnalyticsDaily)
            .values({
              releaseId: releaseDbId,
              date,
              adds: addDates[ddmmyyyy] ?? 0,
              removals: removeDates[ddmmyyyy] ?? 0,
              clicks: clickDates[ddmmyyyy] ?? 0,
            })
            .onConflictDoUpdate({
              target: [sendflowAnalyticsDaily.releaseId, sendflowAnalyticsDaily.date],
              set: {
                adds: addDates[ddmmyyyy] ?? 0,
                removals: removeDates[ddmmyyyy] ?? 0,
                clicks: clickDates[ddmmyyyy] ?? 0,
                updatedAt: now,
              },
            });
          analyticsRows++;
        }
      }

      // Leadscoring (rate limit MUITO apertado — ~10min entre downloads).
      // Falha em uma release não derruba o sync inteiro.
      try {
        const apiScoring = await client.getLeadscoring(r.id);
        await sleep(THROTTLE_MS);

        // Admins desta release vêm da própria API (campo admins por grupo) —
        // une com a lista hardcoded (OBA). Sem isso, admins de Portugal da
        // Barbara apareceriam como "top leads" no leadscoring.
        const releaseAdmins = collectAdminPhones(apiGroups);
        for (const row of apiScoring) {
          const phone = normalizePhone(row.phone);
          if (!phone) continue;
          if (isAdminPhone(phone) || releaseAdmins.has(phone)) continue;
          await db
            .insert(sendflowLeadscoring)
            .values({
              releaseId: releaseDbId,
              phoneNormalized: phone,
              score: row.score,
              rank: row.rank,
              fetchedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                sendflowLeadscoring.releaseId,
                sendflowLeadscoring.phoneNormalized,
              ],
              set: {
                score: row.score,
                rank: row.rank,
                fetchedAt: now,
              },
            });
          leadscoringRows++;
        }
      } catch (err) {
        console.warn(`[sendflow-sync] getLeadscoring(${r.id}) falhou:`, err);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(syncJobs)
        .set({
          status: "failed",
          finishedAt: new Date(),
          rowsProcessed: groupCount + analyticsRows + leadscoringRows,
          errorMessage: msg.slice(0, 500),
          details: { releaseCount, groupCount, analyticsRows, leadscoringRows },
        })
        .where(eq(syncJobs.id, job.id));
    } catch (uErr) {
      console.error("[sendflow-sync] failed to persist failure:", uErr);
    }
    throw err;
  }

  const durationMs = Date.now() - t0;
  await db
    .update(syncJobs)
    .set({
      status: "done",
      finishedAt: new Date(),
      rowsProcessed: groupCount + analyticsRows + leadscoringRows,
      details: { releaseCount, groupCount, analyticsRows, leadscoringRows, durationMs },
    })
    .where(eq(syncJobs.id, job.id));

  return {
    jobId: job.id,
    releases: releaseCount,
    groups: groupCount,
    analyticsRows,
    leadscoringRows,
    durationMs,
  };
}
