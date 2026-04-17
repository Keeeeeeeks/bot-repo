import { NextResponse } from "next/server";
import { fetchLatestSnapshot } from "@/lib/snapshots";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;
  const snap = await fetchLatestSnapshot(owner, name);
  if (!snap) return NextResponse.json({ error: "not scanned yet" }, { status: 404 });
  return NextResponse.json(snap);
}
