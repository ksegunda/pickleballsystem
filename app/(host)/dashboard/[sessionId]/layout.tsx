import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { getHostAction } from "@/actions/auth.actions";
import { Sidebar } from "@/components/host/layout/Sidebar";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { cn } from "@/lib/utils/cn";

interface DashboardLayoutProps {
  children:    React.ReactNode;
  params:      Promise<{ sessionId: string }>;
}

export default async function DashboardLayout({ children, params }: DashboardLayoutProps) {
  const { sessionId } = await params;

  const supabase = await createClient();
  const service   = new SessionService(supabase);

  const [host, session] = await Promise.all([
    getHostAction(),
    service.getSession(sessionId).catch(() => null),
  ]);

  if (!host) redirect("/login");
  if (!session || session.host_id !== host.id) {
    redirect("/sessions");
  }

  return (
    <div className="min-h-screen bg-background">
      <ConnectionBanner />
      <Sidebar sessionId={sessionId} host={host} sessionName={session.session_name} sessionStatus={session.status} />

      {/* Main content — offset for sidebar on desktop */}
      <main className={cn("lg:pl-[var(--sidebar-width)] min-h-screen")}>
        <div className="px-6 py-6 pt-20 lg:pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}
