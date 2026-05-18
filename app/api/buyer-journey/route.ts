import { NextResponse, type NextRequest } from "next/server";
import { getBuyerJourney } from "@/lib/queries/purchases";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function isAuthorized(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = req.nextUrl.searchParams.get("email");
  const phone = req.nextUrl.searchParams.get("phone");
  const journey = await getBuyerJourney({ email, phone });
  return NextResponse.json(journey);
}
