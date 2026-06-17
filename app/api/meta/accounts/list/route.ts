import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { adAccounts } from "@/lib/schema/meta";
import { isAllowedMetaAccount } from "@/lib/client-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const accounts = (await db.select().from(adAccounts)).filter((a) =>
    isAllowedMetaAccount(a.name),
  );
  return NextResponse.json({ accounts });
}
