import { cookies } from "next/headers";
import { isAdmin, verifyToken } from "@/lib/admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const token = c.get("tcabr_admin")?.value;
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) throw new Error("ADMIN_TOKEN_SECRET missing");

  let authed = false;
  if (token) {
    try {
      const { email } = verifyToken(token, secret);
      authed = isAdmin(email);
    } catch { /* fall through */ }
  }
  // This layout is simple enough that we conditionally redirect inside the page components.
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">TCABR Admin</h1>
        <span className="text-xs text-neutral-500">{authed ? "signed in" : "not signed in"}</span>
      </header>
      {children}
    </div>
  );
}
