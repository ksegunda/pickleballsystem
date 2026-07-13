"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Lock, Users } from "lucide-react";
import { createManualMatchAction } from "@/actions/match.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import type { Database } from "@/types/database.types";
import type { TeamSide } from "@/types/database.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

// How far into the priority-ordered queue a host is allowed to hand-pick
// from — keeps "manual" matches from cutting brand-new joiners in line.
const FAIR_WINDOW = 10;

interface ManualMatchPickerProps {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  sessionId:       string;
  queue:           QueueRow[];
  playersPerMatch: number;
  onCreated:       () => void;
}

export function ManualMatchPicker({
  open, onOpenChange, sessionId, queue, playersPerMatch, onCreated,
}: ManualMatchPickerProps) {
  const [assignments, setAssignments] = useState<Record<string, TeamSide>>({});
  const [creating, setCreating]       = useState(false);

  useEffect(() => {
    if (open) setAssignments({});
  }, [open]);

  const teamSize = playersPerMatch / 2;
  const teamA = Object.entries(assignments).filter(([, t]) => t === "team_a").map(([id]) => id);
  const teamB = Object.entries(assignments).filter(([, t]) => t === "team_b").map(([id]) => id);
  const canSave = teamA.length === teamSize && teamB.length === teamSize;

  const eligibleIds = new Set(queue.slice(0, FAIR_WINDOW).map((q) => q.player_id));

  function handlePick(playerId: string, team: TeamSide) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (next[playerId] === team) {
        delete next[playerId];
        return next;
      }
      const currentCount = Object.values(next).filter((t) => t === team).length;
      if (currentCount >= teamSize) return prev; // that team is already full
      next[playerId] = team;
      return next;
    });
  }

  async function handleCreate() {
    if (!canSave) return;
    setCreating(true);
    try {
      const result = await createManualMatchAction(sessionId, teamA, teamB);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Manual match created.");
      onCreated();
    } catch {
      toast.error("Could not create the match. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Manual Match</DialogTitle>
          <DialogDescription>
            Pick {teamSize} player{teamSize === 1 ? "" : "s"} per team from the front of the queue.
            Players further back stay locked to keep things fair.
          </DialogDescription>
        </DialogHeader>

        {queue.length === 0 ? (
          <EmptyState icon={Users} title="No one is waiting" description="There's no one in the queue to pick from right now." />
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {queue.map((q) => {
              const eligible = eligibleIds.has(q.player_id);
              const assignment = assignments[q.player_id];
              return (
                <div
                  key={q.queue_id}
                  className={`flex items-center justify-between gap-3 rounded-xl border border-border p-2.5 ${
                    eligible ? "" : "opacity-40"
                  }`}
                  title={eligible ? undefined : "Not yet near the front of the queue"}
                >
                  <span className="truncate text-sm font-medium text-foreground">{q.display_name}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!eligible && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                    <Button
                      type="button"
                      size="sm"
                      variant={assignment === "team_a" ? "default" : "outline"}
                      disabled={!eligible}
                      onClick={() => handlePick(q.player_id, "team_a")}
                    >
                      Team A
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={assignment === "team_b" ? "default" : "outline"}
                      disabled={!eligible}
                      onClick={() => handlePick(q.player_id, "team_b")}
                    >
                      Team B
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canSave} loading={creating}>
            <Check className="h-4 w-4" />
            Create Match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
