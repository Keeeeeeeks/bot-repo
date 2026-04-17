import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { isAdmin, verifyToken } from "@/lib/admin-auth";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["accept", "reject"]) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const c = await cookies();
  const token = c.get("tcabr_admin")?.value;
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!token || !secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { email } = verifyToken(token, secret);
    if (!isAdmin(email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { id } = await params;
  const db = supabaseService();

  const { data: rr } = await db
    .from("removal_request").select("id, gh_username, status").eq("id", id).maybeSingle();
  if (!rr) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rr.status !== "open") return NextResponse.json({ error: "already processed" }, { status: 409 });

  if (parsed.data.action === "accept") {
    await db.from("user_exclusion").upsert({
      gh_username: rr.gh_username,
      removal_request_id: rr.id,
      reason: "admin accepted removal",
    });
    await db.from("removal_request").update({ status: "accepted" }).eq("id", rr.id);
  } else {
    await db.from("removal_request").update({ status: "rejected" }).eq("id", rr.id);
  }
  return NextResponse.json({ ok: true });
}
