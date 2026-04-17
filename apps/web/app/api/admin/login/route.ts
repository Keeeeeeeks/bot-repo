import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, signToken } from "@/lib/admin-auth";
import { makeMailer } from "@/lib/email";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { email } = parsed.data;

  if (!isAdmin(email)) {
    // Always return OK to avoid leaking which emails are admins.
    return NextResponse.json({ ok: true });
  }
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  const token = signToken(email, secret, 15 * 60 * 1000); // 15 min
  const origin = new URL(req.url).origin;
  const link = `${origin}/api/admin/callback?t=${encodeURIComponent(token)}`;
  await makeMailer().send(email, "TCABR admin login", `Click to sign in (15 min): ${link}`);
  return NextResponse.json({ ok: true });
}
