import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing`);
  return value;
}

export function getRedis(): Redis {
  redis ??= new Redis({
    url: requiredEnv("UPSTASH_REDIS_REST_URL"),
    token: requiredEnv("UPSTASH_REDIS_REST_TOKEN"),
  });
  return redis;
}

export const JOB_QUEUE_KEY = "tcabr:scan:queue";
export const jobStatusKey = (id: string) => `tcabr:scan:status:${id}`;
