import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Users, Zap, LogOut, Trophy, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { PlayerService } from "@/services/player.service";
import { getHostAction, logoutAction } from "@/actions/auth.actions";
import type { Session } from "@/types/session.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { SessionStatusBadge } from "@/components/shared/StatusBadge";
import { DeleteSessionButton } from "@/components/host/session/DeleteSessionButton";
import { SubscriptionBadge } from "@/components/host/session/SubscriptionBadge";
import { NewSessionButton } from "@/components/host/session/NewSessionButton";
import { SubscriptionLimitBanner } from "@/components/host/session/SubscriptionLimitBanner";
import { formatDate } from "@/lib/utils/format";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const [supabase, host] = await Promise.all([createClient(), getHostAction()]);
  const service = new SessionService(supabase);
  const sessions: Session[] = host ? await service.getHostSessions(host.id) : [];

  const playerService = new PlayerService(supabase);
  const totalPlayersServed = sessions.length > 0
    ? await playerService.getTotalPlayersServed(sessions.map((s) => s.id))
    : 0;
  const subscription = host ? await service.getSubscriptionUsage(host.id) : null;

  const active   = sessions.filter((s) => s.status === "active");
  const pending  = sessions.filter((s) => s.status === "pending");
  const past     = sessions.filter((s) => ["ended", "archived"].includes(s.status));

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary">
              {host?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={host.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Zap className="h-4 w-4 text-white" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold">OpenPlay</p>
              <p className="text-xs text-muted-foreground">
                {host?.club_name ?? host?.name ?? "Host Dashboard"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {subscription && (
              <NewSessionButton allowed={subscription.allowed} reason={subscription.reason} />
            )}
            <Button variant="ghost" size="icon" title="Settings" asChild>
              <Link href={ROUTES.SETTINGS}>
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="icon" title="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Welcome banner */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {host?.club_name || host?.name ? `Welcome back, ${host.club_name || host.name}` : "Welcome back!"}
            </h1>
            <p className="mt-1 text-muted-foreground">
              Manage your open play sessions and monitor player activity.
            </p>
          </div>
          {subscription && (
            <SubscriptionBadge
              planType={subscription.plan_type}
              status={subscription.status}
              used={subscription.used}
              limit={subscription.limit}
              expiresAt={subscription.expires_at}
            />
          )}
        </div>

        {subscription && !subscription.allowed && (
          <SubscriptionLimitBanner
            reason={subscription.reason}
            used={subscription.used}
            limit={subscription.limit}
          />
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Sessions",        value: sessions.length,      icon: Calendar },
            { label: "Active Now",            value: active.length,        icon: Zap },
            { label: "Players Today",         value: "—",                  icon: Users },
            { label: "Total Players Served",  value: totalPlayersServed,   icon: Trophy },
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
            <p className="mb-3 text-xs text-muted-foreground">
              Player data, matches, and stats stay viewable here — nothing was deleted when these ended.
            </p>
            <div className="space-y-3">
              {past.map((session) => (
                <SessionRow key={session.id} session={session} showDelete />
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
                  subscription && (
                    <NewSessionButton
                      allowed={subscription.allowed}
                      reason={subscription.reason}
                      label="Create First Session"
                    />
                  )
                }
              />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function SessionRow({ session, showDelete = false }: { session: Session; showDelete?: boolean }) {
  const isActive = session.status === "active";
  return (
    <Card className={`transition-all duration-150 hover:shadow-card-md hover:border-primary/30 ${isActive ? "border-primary/20" : ""}`}>
      <CardContent className="p-4 flex items-center gap-4">
        <Link href={ROUTES.DASHBOARD(session.id)} className="flex min-w-0 flex-1 items-center gap-4">
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
        </Link>
        {showDelete && <DeleteSessionButton sessionId={session.id} sessionName={session.session_name} />}
      </CardContent>
    </Card>
  );
}
