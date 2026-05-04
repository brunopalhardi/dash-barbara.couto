import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { syncJobs } from "@/lib/schema/sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync/refresh
 *
 * Chamado por:
 * - Botão "atualizar agora" no dashboard (com sessão de usuário)
 * - Vercel Cron, 1x/dia 02:00 SP (header Authorization: Bearer $CRON_SECRET)
 *
 * MVP: registra um job "ping" em sync_jobs.
 * Sub-projeto 2 substitui pela sync real do Meta.
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  // 1) Vercel Cron envia Authorization: Bearer $CRON_SECRET
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  // 2) Usuário logado via Supabase
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const [row] = await db
    .insert(syncJobs)
    .values({ type: "ping", status: "running", startedAt })
    .returning({ id: syncJobs.id });

  // Trabalho real virá no sub-projeto 2
  const finishedAt = new Date();
  await db
    .update(syncJobs)
    .set({ status: "done", finishedAt, rowsProcessed: 0 })
    .where(eq(syncJobs.id, row.id));

  return NextResponse.json({
    jobId: row.id,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  });
}

// Vercel Cron envia GET por padrão; aceitar ambos
export const GET = POST;
