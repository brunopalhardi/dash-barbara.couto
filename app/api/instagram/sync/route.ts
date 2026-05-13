import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInstagramClient } from "@/lib/instagram/client";
import { syncInstagram, type IgSyncMode } from "@/lib/sync/syncInstagram";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "IG_ACCESS_TOKEN not set" },
      { status: 500 },
    );
  }

  let mode: IgSyncMode = "manual";
  try {
    const body = (await req.json()) as { mode?: IgSyncMode };
    if (body?.mode === "backfill" || body?.mode === "daily" || body?.mode === "manual") {
      mode = body.mode;
    }
  } catch {
    /* no body */
  }

  const client = createInstagramClient({
    token,
    graphVersion: process.env.IG_GRAPH_VERSION,
  });
  const result = await syncInstagram({ mode, client });
  return NextResponse.json(result);
}

export const GET = POST;
