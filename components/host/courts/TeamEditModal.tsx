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
  id, label, players, full,
}: {
  id: TeamSide;
  label: string;
  players: RosterPlayer[];
  full: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: full });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] space-y-2 rounded-2xl border-2 border-dashed p-3 transition-colors ${
        isOver ? "border-primary bg-primary/5" : full ? "border-border/50 bg-muted/30" : "border-border"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label} · {players.length}{full ? " · full" : ""}
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
    const from = teamA.some((p) => p.player_id === playerId) ? teamA : teamB;
    const player = from.find((p) => p.player_id === playerId);
    if (!player || player.team === destTeam) return;

    const moved = { ...player, team: destTeam };
    setTeamA((prev) => (destTeam === "team_a" ? [...prev.filter((p) => p.player_id !== playerId), moved] : prev.filter((p) => p.player_id !== playerId)));
    setTeamB((prev) => (destTeam === "team_b" ? [...prev.filter((p) => p.player_id !== playerId), moved] : prev.filter((p) => p.player_id !== playerId)));
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
            <TeamZone id="team_a" label="Team A" players={teamA} full={teamA.length >= teamCap} />
            <TeamZone id="team_b" label="Team B" players={teamB} full={teamB.length >= teamCap} />
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
