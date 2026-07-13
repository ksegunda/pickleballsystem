"use client";

import { useState } from "react";
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GripVertical, Check } from "lucide-react";
import { updateMatchTeamsAction } from "@/actions/match.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import type { ForecastSet } from "@/types/match.types";
import type { TeamSide } from "@/types/database.types";

interface TeamEditModalProps {
  sessionId: string;
  set:       ForecastSet;
  onClose:   () => void;
  onSaved:   () => void;
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

function DropZone({
  id, label, players,
}: {
  id: TeamSide;
  label: string;
  players: Array<{ player_id: string; display_name: string }>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[160px] space-y-2 rounded-2xl border-2 border-dashed p-3 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label} · {players.length}
      </p>
      <div className="space-y-2">
        {players.map((p) => (
          <motion.div key={p.player_id} layoutId={p.player_id} layout>
            <DraggableChip id={p.player_id} name={p.display_name} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function TeamEditModal({ sessionId, set, onClose, onSaved }: TeamEditModalProps) {
  const [assignments, setAssignments] = useState<Record<string, TeamSide>>(() => {
    const initial: Record<string, TeamSide> = {};
    for (const p of set.players) initial[p.player_id] = p.team;
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const teamA = set.players.filter((p) => assignments[p.player_id] === "team_a");
  const teamB = set.players.filter((p) => assignments[p.player_id] === "team_b");
  const canSave = teamA.length > 0 && teamB.length > 0;

  function handleDragEnd(event: DragEndEvent) {
    const zone = event.over?.id;
    if (zone !== "team_a" && zone !== "team_b") return;
    setAssignments((prev) => ({ ...prev, [String(event.active.id)]: zone }));
  }

  async function handleSave() {
    if (!canSave || !set.matchId) return;
    setSaving(true);
    try {
      const result = await updateMatchTeamsAction(
        sessionId,
        set.matchId,
        teamA.map((p) => p.player_id),
        teamB.map((p) => p.player_id)
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Teams updated.");
      onSaved();
    } catch {
      toast.error("Could not save the new teams. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Teams</DialogTitle>
          <DialogDescription>
            Drag a player to move them between teams, then save.
          </DialogDescription>
        </DialogHeader>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 gap-3">
            <DropZone id="team_a" label="Team A" players={teamA} />
            <DropZone id="team_b" label="Team B" players={teamB} />
          </div>
        </DndContext>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave} loading={saving}>
            <Check className="h-4 w-4" />
            Save Teams
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
