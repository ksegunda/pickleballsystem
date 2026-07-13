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
  hasManualSlot:   boolean;
  queue:           QueueRow[];
  playersPerMatch: number;
  onChanged:       () => void;
}

export function ForecastPoolSection({
  sessionId, sets, hasManualSlot, queue, playersPerMatch, onChanged,
}: ForecastPoolSectionProps) {
  const [editingSet, setEditingSet] = useState<ForecastSet | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (sets.length === 0 && !hasManualSlot) return null;

  const readyCount = sets.filter((s) => s.matchId !== null).length;

  // Only ever called for a ready (matchId !== null) set — renderEmptyCard
  // handles the placeholder case separately.
  function renderCard(set: ForecastSet) {
    const label = set.isManual ? "Manual" : `Set ${set.setNumber}`;
    const teamA = set.players.filter((p) => p.team === "team_a");
    const teamB = set.players.filter((p) => p.team === "team_b");

    return (
      <Card
        key={set.matchId}
        className="cursor-pointer transition-colors hover:border-primary/50"
        onClick={() => {
          // TEMP DIAGNOSTIC for Bug 3 (no modal on click) — remove once confirmed.
          console.error("[ForecastPoolSection] card clicked", { label, matchId: set.matchId, playerCount: set.players.length });
          setEditingSet(set);
        }}
      >
        <CardContent className="p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>

          {teamB.length > 0 ? (
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
          )}
        </CardContent>
      </Card>
    );
  }

  function renderEmptyCard(set: ForecastSet) {
    return (
      <Card key={`empty-${set.setNumber}`} className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {`Set ${set.setNumber}`}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            Waiting for {set.missing} more player{set.missing === 1 ? "" : "s"}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderAddManualCard() {
    return (
      <Card
        key="add-manual"
        className="cursor-pointer border-dashed transition-colors hover:border-primary/50"
        onClick={() => setPickerOpen(true)}
      >
        <CardContent className="p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Manual</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Plus className="h-4 w-4" />
            Add a match
          </div>
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
        {sets.map((set) => (set.matchId !== null ? renderCard(set) : renderEmptyCard(set)))}
        {!hasManualSlot && renderAddManualCard()}
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
