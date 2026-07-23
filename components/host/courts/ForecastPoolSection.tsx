"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Plus, Users } from "lucide-react";
import { incrementForecastTargetAction } from "@/actions/match.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ManualMatchPicker } from "./ManualMatchPicker";
import type { ForecastSet } from "@/types/match.types";
import type { Database } from "@/types/database.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

interface ForecastPoolSectionProps {
  sessionId:       string;
  sets:            ForecastSet[];
  queue:           QueueRow[];
  playersPerMatch: number;
  onChanged:       () => void;
  onEditPlayers:   () => void;
}

export function ForecastPoolSection({
  sessionId, sets, queue, playersPerMatch, onChanged, onEditPlayers,
}: ForecastPoolSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingSet, setAddingSet]   = useState(false);

  const readyCount = sets.filter((s) => s.matchId !== null).length;

  async function handleAddSet() {
    setAddingSet(true);
    try {
      const result = await incrementForecastTargetAction(sessionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onChanged();
    } catch {
      toast.error("Could not add another set. Please try again.");
    } finally {
      setAddingSet(false);
    }
  }

  // Only ever called for a ready (matchId !== null) set — renderEmptyCard
  // handles the placeholder case separately.
  function renderCard(set: ForecastSet) {
    const label = set.isManual ? "Manual" : `Set ${set.setNumber}`;
    const teamA = set.players.filter((p) => p.team === "team_a");
    const teamB = set.players.filter((p) => p.team === "team_b");
    const isIncomplete = teamA.length !== teamB.length || teamA.length + teamB.length !== playersPerMatch;

    return (
      <Card
        key={set.matchId}
        className="cursor-pointer transition-colors hover:border-primary/50"
        onClick={onEditPlayers}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {isIncomplete && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                Incomplete
              </span>
            )}
          </div>

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
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          title="Add another set"
          loading={addingSet}
          onClick={handleAddSet}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Not tied to a specific court — whichever court frees up first claims the oldest set.
        Click a ready set to edit teams.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((set) => (set.matchId !== null ? renderCard(set) : renderEmptyCard(set)))}
        {renderAddManualCard()}
      </div>

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
