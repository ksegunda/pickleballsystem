"use client";

import { useState } from "react";
import { ArrowRight, Plus, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TeamEditModal } from "./TeamEditModal";
import { ManualMatchPicker } from "./ManualMatchPicker";
import type { ForecastSet } from "@/types/match.types";
import type { Database } from "@/types/database.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

interface ForecastPoolSectionProps {
  sessionId:       string;
  sets:            ForecastSet[];
  manualSlot:      ForecastSet | null;
  queue:           QueueRow[];
  playersPerMatch: number;
  onChanged:       () => void;
}

export function ForecastPoolSection({
  sessionId, sets, manualSlot, queue, playersPerMatch, onChanged,
}: ForecastPoolSectionProps) {
  const [editingSet, setEditingSet] = useState<ForecastSet | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (sets.length === 0 && !manualSlot) return null;

  const readyCount = sets.filter((s) => s.matchId !== null).length;

  function renderCard(set: ForecastSet, label: string, isManualCard: boolean) {
    const teamA = set.players.filter((p) => p.team === "team_a");
    const teamB = set.players.filter((p) => p.team === "team_b");
    const isReady = set.matchId !== null;
    const clickable = isReady || isManualCard;

    return (
      <Card
        key={label}
        className={[
          isReady ? "" : "border-dashed",
          clickable ? "cursor-pointer transition-colors hover:border-primary/50" : "",
        ].join(" ")}
        onClick={clickable ? () => (isReady ? setEditingSet(set) : setPickerOpen(true)) : undefined}
      >
        <CardContent className="p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>

          {isReady ? (
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
          ) : isManualCard ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Plus className="h-4 w-4" />
              Add a match
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              Waiting for {set.missing} more player{set.missing === 1 ? "" : "s"}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

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
        Click a ready set to edit teams.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((set) => renderCard(set, `Set ${set.setNumber}`, false))}
        {manualSlot && renderCard(manualSlot, "Manual", true)}
      </div>

      {editingSet && (
        <TeamEditModal
          sessionId={sessionId}
          set={editingSet}
          onClose={() => setEditingSet(null)}
          onSaved={() => { setEditingSet(null); onChanged(); }}
        />
      )}

      <ManualMatchPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        sessionId={sessionId}
        queue={queue}
        playersPerMatch={playersPerMatch}
        onCreated={() => { setPickerOpen(false); onChanged(); }}
      />
    </div>
  );
}
