"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { createLockedSetAction } from "@/actions/match.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import type { TeamSide } from "@/types/database.types";

interface LockTeamAssignModalProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  sessionId:    string;
  players:      Array<{ player_id: string; display_name: string }>;
  onLocked:     () => void;
}

// Pre-selected 4 players (chosen via checkboxes on the Queue list) — this
// modal only decides the 2v2 split, unlike ManualMatchPicker which also
// picks who's eligible in the first place.
export function LockTeamAssignModal({ open, onOpenChange, sessionId, players, onLocked }: LockTeamAssignModalProps) {
  const [assignments, setAssignments] = useState<Record<string, TeamSide>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setAssignments({});
  }, [open]);

  const teamA = Object.entries(assignments).filter(([, t]) => t === "team_a").map(([id]) => id);
  const teamB = Object.entries(assignments).filter(([, t]) => t === "team_b").map(([id]) => id);
  const canSave = teamA.length === 2 && teamB.length === 2;

  function handlePick(playerId: string, team: TeamSide) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (next[playerId] === team) {
        delete next[playerId];
        return next;
      }
      const currentCount = Object.values(next).filter((t) => t === team).length;
      if (currentCount >= 2) return prev; // that team is already full
      next[playerId] = team;
      return next;
    });
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const orderedPlayers = [...teamA, ...teamB];
      const orderedTeams: TeamSide[] = [
        ...teamA.map(() => "team_a" as const),
        ...teamB.map(() => "team_b" as const),
      ];
      const result = await createLockedSetAction(sessionId, "full_match", orderedPlayers, orderedTeams);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Full match locked — this exact matchup is next.");
      onLocked();
    } catch {
      toast.error("Could not lock this match. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lock Full Match</DialogTitle>
          <DialogDescription>
            Assign these 4 players to Team A or Team B. This exact matchup is guaranteed for
            their next match — no other queue player is involved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {players.map((p) => {
            const assignment = assignments[p.player_id];
            return (
              <div
                key={p.player_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-2.5"
              >
                <span className="truncate text-sm font-medium text-foreground">{p.display_name}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={assignment === "team_a" ? "default" : "outline"}
                    onClick={() => handlePick(p.player_id, "team_a")}
                  >
                    Team A
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={assignment === "team_b" ? "default" : "outline"}
                    onClick={() => handlePick(p.player_id, "team_b")}
                  >
                    Team B
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave} loading={saving}>
            <Check className="h-4 w-4" />
            Lock Match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
