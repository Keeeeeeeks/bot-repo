import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin, verifyToken } from "@/lib/admin-auth";
import { supabaseService } from "@/lib/supabase";
import { AdminQueueRow } from "@/components/AdminQueueRow";

export const dynamic = "force-dynamic";

export default async function AdminQueue() {
  const c = await cookies();
  const token = c.get("tcabr_admin")?.value;
  const secret = process.env.ADMIN_TOKEN_SECRET!;
  if (!token) redirect("/admin/login");
  try {
    const { email } = verifyToken(token, secret);
    if (!isAdmin(email)) redirect("/admin/login");
  } catch {
    redirect("/admin/login");
  }

  const db = supabaseService();
  const { data: rows } = await db
    .from("removal_request")
    .select("id, gh_username, contact_email, reason, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Removal queue</h2>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {(rows ?? []).map((r) => <AdminQueueRow key={r.id} req={r} />)}
      </ul>
    </section>
  );
}
