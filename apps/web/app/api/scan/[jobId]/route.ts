import { NextRequest, NextResponse } from "next/server";
import { getJobStatus } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  if (!/^scan_[a-f0-9-]+$/.test(jobId)) {
    return NextResponse.json({ error: "invalid job id" }, { status: 400 });
  }
  const status = await getJobStatus(jobId);
  if (!status) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  return NextResponse.json(status);
}
