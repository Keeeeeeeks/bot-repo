import { NextRequest, NextResponse } from "next/server";
import { isAdmin, verifyToken } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("t");
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!token || !secret) return NextResponse.redirect(new URL("/admin/login", req.url));
  try {
    const { email } = verifyToken(token, secret);
    if (!isAdmin(email)) throw new Error("not an admin");
    const resp = NextResponse.redirect(new URL("/admin/queue", req.url));
    resp.cookies.set("tcabr_admin", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });
    return resp;
  } catch {
    return NextResponse.redirect(new URL("/admin/login?err=1", req.url));
  }
}
