import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const JOB_QUEUE_KEY = "tcabr:scan:queue";
export const jobStatusKey = (id: string) => `tcabr:scan:status:${id}`;
