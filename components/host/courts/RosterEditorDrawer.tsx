"use client";

import { useState } from "react";
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GripVertical, Users } from "lucide-react";
import { movePlayerAction } from "@/actions/match.actions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import type { ForecastSet, CourtView } from "@/types/match.types";
import type { Database, TeamSide } from "@/types/database.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

interface RosterEditorDrawerProps {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  sessionId:       string;
  courts:          CourtView[];
  forecastPool:    ForecastSet[];
  queue:           QueueRow[];
  playersPerMatch: number;
  onChanged:       () => void;
}

// "queue" or "<matchId>:<team_a|team_b>"
type ZoneId = string;

function parseZone(id: ZoneId): { matchId: string | null; team: TeamSide | null } {
  if (id === "queue") return { matchId: null, team: null };
  const [matchId, team] = id.split(":");
  return { matchId, team: team as TeamSide };
}

function DraggableChip({ id, name, disabled }: { id: string; name: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });

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
  id, label, players, full,
}: {
  id: ZoneId;
  label: string;
  players: Array<{ player_id: string; display_name: string }>;
  full?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: full });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[72px] space-y-2 rounded-2xl border-2 border-dashed p-3 transition-colors ${
        isOver ? "border-primary bg-primary/5" : full ? "border-border/50 bg-muted/30" : "border-border"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label} · {players.length}{full ? " · full" : ""}
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

export function RosterEditorDrawer({
  open, onOpenChange, sessionId, courts, forecastPool, queue, playersPerMatch, onChanged,
}: RosterEditorDrawerProps) {
  const [moving, setMoving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const teamCap = Math.ceil(playersPerMatch / 2);

  const activeSets   = forecastPool.filter((s) => s.matchId !== null);
  const activeCourts = courts.filter((c) => c.match_id !== null);

  async function handleDragEnd(event: DragEndEvent) {
    const zone = event.over?.id;
    if (zone === undefined) return;

    const playerId = String(event.active.id);
    const { matchId, team } = parseZone(String(zone));

    setMoving(true);
    try {
      const result = await movePlayerAction(sessionId, playerId, matchId, team);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onChanged();
    } catch {
      toast.error("Could not move this player. Please try again.");
    } finally {
      setMoving(false);
    }
  }

  function renderMatchCard(
    key: string,
    label: string,
    statusBadge: string,
    matchId: string,
    players: Array<{ player_id: string; display_name: string; team: TeamSide }>
  ) {
    const teamA = players.filter((p) => p.team === "team_a");
    const teamB = players.filter((p) => p.team === "team_b");

    return (
      <div key={key} className="rounded-2xl border border-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
            {statusBadge}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DropZone id={`${matchId}:team_a`} label="Team A" players={teamA} full={teamA.length >= teamCap} />
          <DropZone id={`${matchId}:team_b`} label="Team B" players={teamB} full={teamB.length >= teamCap} />
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Players</DialogTitle>
          <DialogDescription>
            Drag a player between the queue, any Next Up set, or any court — including a court
            that&apos;s live right now. Changes save the moment you drop them.
          </DialogDescription>
        </DialogHeader>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Queue</p>
              </div>
              <DropZone
                id="queue"
                label="Waiting"
                players={queue.map((q) => ({ player_id: q.player_id, display_name: q.display_name }))}
              />
            </div>

            {activeSets.length === 0 && activeCourts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No sets or courts with players yet.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeSets.map((set) =>
                  renderMatchCard(`set-${set.matchId}`, `Set ${set.setNumber}`, "Next Up", set.matchId!, set.players)
                )}
                {activeCourts.map((court) => {
                  const players = (court.players as unknown as Array<{ player_id: string; display_name: string; team: TeamSide }>) ?? [];
                  return renderMatchCard(
                    `court-${court.match_id}`,
                    court.court_name,
                    court.match_status === "in_progress" ? "Live" : "Ready",
                    court.match_id!,
                    players
                  );
                })}
              </div>
            )}
          </div>
        </DndContext>

        {moving && <p className="text-xs text-muted-foreground text-center">Moving…</p>}
      </DialogContent>
    </Dialog>
  );
}
