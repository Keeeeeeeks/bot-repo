import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const Body = z.object({
  gh_username: z.string().min(1).max(64),
  contact_email: z.string().email().optional().or(z.literal("")),
  reason: z.string().max(1000).optional().or(z.literal("")),
});

const RATE_WINDOW_MIN = 10;

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const db = supabaseService();
  // Simple per-username rate limit: one open request per 10 minutes.
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60 * 1000).toISOString();
  const { data: existing } = await db
    .from("removal_request")
    .select("id")
    .eq("gh_username", parsed.data.gh_username)
    .gte("created_at", since)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "duplicate request; already queued" }, { status: 429 });
  }

  const { error } = await db.from("removal_request").insert({
    gh_username: parsed.data.gh_username,
    contact_email: parsed.data.contact_email || null,
    reason: parsed.data.reason || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
