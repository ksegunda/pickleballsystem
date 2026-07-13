import { redirect } from "next/navigation";
import { getPlatformAdminAction } from "@/actions/admin.actions";
import { ROUTES } from "@/lib/constants/routes";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminId = await getPlatformAdminAction();
  if (!adminId) redirect(ROUTES.SESSIONS);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform Admin</p>
          <h1 className="text-xl font-bold text-foreground">Super Admin</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
