import type { SubscriptionTier } from "@tcabr/shared";

const HOUR = 60 * 60 * 1000;

export function cacheFreshnessMs(tier: SubscriptionTier): number {
  switch (tier) {
    case "free":
      return 24 * HOUR;
    case "pro":
      return 0; // on-demand: any existing snapshot is "stale" for Pro, triggering re-scan
    case "team":
      return 0;
  }
}

export function isSnapshotFresh(
  createdAt: Date,
  tier: SubscriptionTier,
  now: number = Date.now(),
): boolean {
  const ttl = cacheFreshnessMs(tier);
  if (ttl === 0) return false;
  return now - createdAt.getTime() <= ttl;
}
