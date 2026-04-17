import { NextResponse } from "next/server";
import { fetchLeaderboard } from "@/lib/snapshots";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const side = url.searchParams.get("side") === "clean" ? "clean" : "suspicious";
  const rows = await fetchLeaderboard(side, 25);
  return NextResponse.json({ side, rows });
}
