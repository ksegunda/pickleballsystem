"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Activity, Clock, CheckSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSessionSummaryAction } from "@/actions/session.actions";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/types/database.types";
import type { Session } from "@/types/session.types";

type SessionSummary = Database["public"]["Views"]["session_summary_view"]["Row"];

interface DashboardStatsProps {
  sessionId:      string;
  session:        Session;
  initialSummary: SessionSummary | null;
  playersFallback: number;
}

export function DashboardStats({ sessionId, session, initialSummary, playersFallback }: DashboardStatsProps) {
  const [summary, setSummary] = useState(initialSummary);

  const refresh = useCallback(async () => {
    const data = await getSessionSummaryAction(sessionId);
    setSummary(data);
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`session:${sessionId}:dashboard-stats`);

    for (const table of ["players", "matches", "courts"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `session_id=eq.${sessionId}` },
        () => refresh()
      );
    }
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, refresh]);

  const stats = [
    {
      label: "Players",
      value: summary?.total_players ?? playersFallback,
      sub:   `${summary?.players_waiting ?? 0} waiting`,
      icon:  Users,
      color: "text-primary",
      bg:    "bg-primary/10",
    },
    {
      label: "Courts",
      value: `${(summary?.number_of_courts ?? session.number_of_courts) - (summary?.courts_available ?? session.number_of_courts)} / ${session.number_of_courts}`,
      sub:   `${summary?.courts_available ?? session.number_of_courts} available`,
      icon:  Activity,
      color: "text-secondary",
      bg:    "bg-secondary/10",
    },
    {
      label: "Matches",
      value: summary?.matches_completed ?? 0,
      sub:   `${summary?.matches_in_progress ?? 0} in progress`,
      icon:  CheckSquare,
      color: "text-accent-foreground",
      bg:    "bg-accent/20",
    },
    {
      label: "Avg Duration",
      value: summary?.avg_match_duration_secs
        ? `${Math.round(summary.avg_match_duration_secs / 60)}m`
        : "—",
      sub:   "per match",
      icon:  Clock,
      color: "text-primary",
      bg:    "bg-primary/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="stat-card">
          <CardContent className="p-0">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground tabular-nums">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.sub}</p>
              </div>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
