import { supabaseService } from "./supabase";

export async function loadExcluded(usernames: string[]): Promise<Set<string>> {
  if (usernames.length === 0) return new Set();
  const db = supabaseService();
  const { data } = await db
    .from("user_exclusion")
    .select("gh_username")
    .in("gh_username", usernames);
  return new Set((data ?? []).map((r) => r.gh_username));
}

export function filterExcluded<T>(
  rows: T[],
  excluded: Set<string>,
  getUsername: (row: T) => string,
): T[] {
  return rows.filter((r) => !excluded.has(getUsername(r)));
}
