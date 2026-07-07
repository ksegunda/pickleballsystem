import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Calendar, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { getHostAction } from "@/actions/auth.actions";
import type { Session } from "@/types/session.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { SessionStatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const [supabase, host] = await Promise.all([createClient(), getHostAction()]);
  const service = new SessionService(supabase);
  const sessions: Session[] = host ? await service.getHostSessions(host.id) : [];

  const active   = sessions.filter((s) => s.status === "active");
  const pending  = sessions.filter((s) => s.status === "pending");
  const past     = sessions.filter((s) => ["ended", "archived"].includes(s.status));

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold">OpenPlay</p>
              <p className="text-xs text-muted-foreground">
                {host?.club_name ?? host?.name ?? "Host Dashboard"}
              </p>
            </div>
          </div>
          <Button asChild size="default">
            <Link href={ROUTES.NEW_SESSION}>
              <Plus className="h-4 w-4" />
              New Session
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Welcome banner */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back, {host?.name?.split(" ")[0] ?? "Host"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage your open play sessions and monitor player activity.
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Sessions", value: sessions.length, icon: Calendar },
            { label: "Active Now",     value: active.length,   icon: Zap },
            { label: "Players Today",  value: "—",             icon: Users },
          ].map((stat) => (
            <Card key={stat.label} className="stat-card">
              <CardContent className="p-0 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active sessions */}
        {active.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground uppercase tracking-wide">
              Active Sessions
            </h2>
            <div className="space-y-3">
              {active.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          </section>
        )}

        {/* Pending / upcoming sessions */}
        {pending.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground uppercase tracking-wide">
              Upcoming Sessions
            </h2>
            <div className="space-y-3">
              {pending.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          </section>
        )}

        {/* Past sessions */}
        {past.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground uppercase tracking-wide">
              Past Sessions
            </h2>
            <div className="space-y-3">
              {past.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {sessions.length === 0 && (
          <Card>
            <CardContent>
              <EmptyState
                icon={Calendar}
                title="No sessions yet"
                description="Create your first open play session to get started. Players join instantly via QR code or a 6-character join code."
                action={
                  <Button asChild>
                    <Link href={ROUTES.NEW_SESSION}>
                      <Plus className="h-4 w-4" />
                      Create First Session
                    </Link>
                  </Button>
                }
              />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function SessionRow({ session }: { session: Session }) {
  const isActive = session.status === "active";
  return (
    <Link href={ROUTES.DASHBOARD(session.id)} className="block group">
      <Card className={`transition-all duration-150 hover:shadow-card-md group-hover:border-primary/30 ${isActive ? "border-primary/20" : ""}`}>
        <CardContent className="p-4 flex items-center gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isActive ? "bg-primary/10" : "bg-muted"}`}>
            <Calendar className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-semibold text-foreground truncate">{session.session_name}</p>
              <SessionStatusBadge status={session.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {session.club_name} · {formatDate(session.session_date)}
            </p>
          </div>
          <div className="flex items-center gap-4 text-right shrink-0">
            <div>
              <p className="text-sm font-mono font-bold text-foreground tracking-widest">
                {session.join_code}
              </p>
              <p className="text-xs text-muted-foreground">Join Code</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{session.number_of_courts}</p>
              <p className="text-xs text-muted-foreground">Courts</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
