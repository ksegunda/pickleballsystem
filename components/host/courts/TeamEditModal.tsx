"use client";

import { useEffect, useState } from "react";
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { GripVertical } from "lucide-react";
import { updateMatchTeamsAction } from "@/actions/match.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import type { TeamSide } from "@/types/database.types";

interface RosterPlayer {
  player_id:    string;
  display_name: string;
  team:         TeamSide;
}

interface TeamEditModalProps {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  sessionId:       string;
  matchId:         string | null;
  label:           string;
  players:         RosterPlayer[];
  playersPerMatch: number;
  onSaved:         () => void;
}

function DraggableChip({ id, name }: { id: string; name: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex touch-none items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm cursor-grab active:cursor-grabbing select-none ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </div>
  );
}

function TeamZone({
  id, label, players,
}: {
  id: TeamSide;
  label: string;
  players: RosterPlayer[];
}) {
  // Always droppable — both teams are permanently at capacity in this
  // fixed-4-player editor (nothing here ever adds/removes a player), so
  // "full" can't mean "reject the drop" the way it used to when a team
  // could sit under capacity waiting for a queue backfill. Dropping onto
  // a full team is a swap (see handleDragEnd), not a capacity violation.
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] space-y-2 rounded-2xl border-2 border-dashed p-3 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label} · {players.length}
      </p>
      <div className="space-y-2">
        {players.map((p) => (
          <DraggableChip key={p.player_id} id={p.player_id} name={p.display_name} />
        ))}
      </div>
    </div>
  );
}

// Local edit buffer only — nothing is saved to the DB until "Save Teams"
// is tapped. Unlike the old board-wide drag-drop editor, there's exactly
// one write per edit session instead of one per drop, so there's no
// per-drag network round trip and no realtime refresh that could land
// mid-drag and interrupt the gesture.
export function TeamEditModal({
  open, onOpenChange, sessionId, matchId, label, players, playersPerMatch, onSaved,
}: TeamEditModalProps) {
  const [teamA, setTeamA] = useState<RosterPlayer[]>([]);
  const [teamB, setTeamB] = useState<RosterPlayer[]>([]);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const teamCap = Math.ceil(playersPerMatch / 2);

  // Reseeds the local buffer fresh from the real roster every time a
  // different match is opened for editing (or the same one is reopened
  // after an earlier save).
  useEffect(() => {
    if (!open) return;
    setTeamA(players.filter((p) => p.team === "team_a"));
    setTeamB(players.filter((p) => p.team === "team_b"));
  }, [open, matchId, players]);

  function handleDragEnd(event: DragEndEvent) {
    const destTeam = event.over?.id as TeamSide | undefined;
    if (!destTeam) return;

    const playerId = String(event.active.id);
    const fromTeam: TeamSide = teamA.some((p) => p.player_id === playerId) ? "team_a" : "team_b";
    if (fromTeam === destTeam) return;

    const sourceList = fromTeam === "team_a" ? teamA : teamB;
    const destList   = destTeam === "team_a" ? teamA : teamB;
    const dragged    = sourceList.find((p) => p.player_id === playerId);
    if (!dragged) return;

    // Both teams are always at capacity here, so dropping onto a full team
    // always displaces its first occupant back to the team the dragged
    // player came from — a genuine swap, never a one-way move that would
    // leave either side over/under capacity.
    const displaced = destList.length >= teamCap ? destList[0] : undefined;

    const newSource = sourceList
      .filter((p) => p.player_id !== playerId)
      .concat(displaced ? [{ ...displaced, team: fromTeam }] : []);
    const newDest = destList
      .filter((p) => p.player_id !== displaced?.player_id)
      .concat([{ ...dragged, team: destTeam }]);

    if (fromTeam === "team_a") {
      setTeamA(newSource);
      setTeamB(newDest);
    } else {
      setTeamB(newSource);
      setTeamA(newDest);
    }
  }

  async function handleSave() {
    if (!matchId) return;
    setSaving(true);
    try {
      const result = await updateMatchTeamsAction(
        sessionId, matchId,
        teamA.map((p) => p.player_id),
        teamB.map((p) => p.player_id)
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Teams updated.");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Could not save these teams. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Teams — {label}</DialogTitle>
          <DialogDescription>
            Drag a player to swap who&apos;s on which team. The 4 players in this match stay the
            same — this doesn&apos;t add, remove, or bring anyone in from the queue.
          </DialogDescription>
        </DialogHeader>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 gap-3">
            <TeamZone id="team_a" label="Team A" players={teamA} />
            <TeamZone id="team_b" label="Team B" players={teamB} />
          </div>
        </DndContext>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save Teams
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
