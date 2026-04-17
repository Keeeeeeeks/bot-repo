import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseRepoRef, RepoRefError } from "@/lib/repo-ref";
import { isSnapshotFresh } from "@/lib/cache-policy";
import { fetchLatestSnapshot } from "@/lib/snapshots";
import { enqueueScan } from "@/lib/queue";

export const runtime = "nodejs";

const Body = z.object({ input: z.string().min(1).max(500) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  let repo;
  try {
    repo = parseRepoRef(parsed.data.input);
  } catch (e) {
    const msg = e instanceof RepoRefError ? e.message : "invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // For Plan 3 everyone is treated as free tier (auth lands in Plan 4).
  const tier = "free" as const;
  const existing = await fetchLatestSnapshot(repo.owner, repo.name);
  if (existing && isSnapshotFresh(new Date(existing.created_at), tier)) {
    return NextResponse.json({
      cached: true,
      report_url: `/r/${repo.owner}/${repo.name}`,
      created_at: existing.created_at,
    });
  }

  const { jobId } = await enqueueScan(repo, null);
  return NextResponse.json({
    cached: false,
    job_id: jobId,
    poll_url: `/api/scan/${jobId}`,
    report_url: `/r/${repo.owner}/${repo.name}`,
  });
}
