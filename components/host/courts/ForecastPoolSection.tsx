"use client";

import { ArrowRight, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ForecastSet } from "@/types/match.types";

interface ForecastPoolSectionProps {
  sets: ForecastSet[];
}

export function ForecastPoolSection({ sets }: ForecastPoolSectionProps) {
  if (sets.length === 0) return null;

  const readyCount = sets.filter((s) => s.matchId !== null).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Next Up</h2>
        <span className="text-xs text-muted-foreground">
          {readyCount} of {sets.length} set{sets.length === 1 ? "" : "s"} ready
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Not tied to a specific court — whichever court frees up first claims the oldest set.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((set) => {
          const teamA = set.players.filter((p) => p.team === "team_a");
          const teamB = set.players.filter((p) => p.team === "team_b");

          return (
            <Card key={set.setNumber} className={set.matchId ? "" : "border-dashed"}>
              <CardContent className="p-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Set {set.setNumber}
                </p>

                {set.matchId ? (
                  teamB.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Team A
                        </p>
                        {teamA.map((p) => (
                          <p key={p.player_id} className="truncate text-foreground">{p.display_name}</p>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Team B
                        </p>
                        {teamB.map((p) => (
                          <p key={p.player_id} className="truncate text-foreground">{p.display_name}</p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 text-sm">
                      {teamA.map((p) => (
                        <p key={p.player_id} className="truncate text-foreground">{p.display_name}</p>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Waiting for {set.missing} more player{set.missing === 1 ? "" : "s"}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
