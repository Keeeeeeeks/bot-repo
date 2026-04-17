import { randomUUID } from "crypto";
import { redis, jobStatusKey } from "./redis";

export interface JobStatus {
  state: "queued" | "running" | "done" | "error";
  snapshot_id?: string;
  error?: string;
  updated_at: string;
}

const ARQ_QUEUE = "arq:queue";

export async function enqueueScan(
  repo: { owner: string; name: string },
  userToken: string | null,
): Promise<{ jobId: string }> {
  const jobId = `scan_${randomUUID()}`;
  // Minimal arq-compatible payload. The worker's `scan_repo(ctx, owner, name, user_token)` signature
  // consumes positional args from `pickle`-serialized list. To avoid a pickle dependency in Node,
  // we push a JSON envelope onto a companion queue that an adapter pops and re-enqueues via the Python
  // arq client. For MVP we use that adapter approach; see `apps/worker/src/tcabr_worker/bridge.py`.
  await redis.lpush("tcabr:scan:requests", JSON.stringify({
    job_id: jobId,
    owner: repo.owner,
    name: repo.name,
    user_token: userToken,
    enqueued_at: new Date().toISOString(),
  }));
  await redis.set(jobStatusKey(jobId), JSON.stringify({
    state: "queued",
    updated_at: new Date().toISOString(),
  } satisfies JobStatus), { ex: 60 * 60 }); // 1h expiry
  return { jobId };
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const raw = await redis.get<string | JobStatus>(jobStatusKey(jobId));
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as JobStatus) : raw;
}

// Silence unused-import lint
void ARQ_QUEUE;
