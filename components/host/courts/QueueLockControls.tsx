"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lock, Users, X } from "lucide-react";
import { createLockedSetAction, deleteLockedSetAction } from "@/actions/match.actions";
import { Button } from "@/components/ui/button";
import { QueueEntryRow } from "@/components/host/queue/QueueEntryRow";
import { EmptyState } from "@/components/shared/EmptyState";
import { LockTeamAssignModal } from "./LockTeamAssignModal";
import type { Database, LockType } from "@/types/database.types";
import type { LockedPlayerRow } from "@/types/match.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

interface QueueLockControlsProps {
  sessionId:     string;
  queue:         QueueRow[];
  lockedPlayers: LockedPlayerRow[];
  onChanged:     () => void;
}

export function QueueLockControls({ sessionId, queue, lockedPlayers, onChanged }: QueueLockControlsProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [locking, setLocking]             = useState(false);

  const lockedById = new Map(lockedPlayers.map((lp) => [lp.player_id, lp]));

  function toggleSelectionMode() {
    setSelectionMode((v) => !v);
    setSelectedIds(new Set());
  }

  function toggleSelected(playerId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function handleUnlock(lockedSetId: string) {
    const result = await deleteLockedSetAction(sessionId, lockedSetId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Unlocked — back to normal fair matchmaking.");
    onChanged();
  }

  async function handleLockPartners() {
    setLocking(true);
    try {
      const result = await createLockedSetAction(sessionId, "partner_pair", Array.from(selectedIds));
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Locked as partners — guaranteed the same team next match.");
      exitSelection();
      onChanged();
    } catch {
      toast.error("Could not lock these players. Please try again.");
    } finally {
      setLocking(false);
    }
  }

  const selectedPlayers = queue.filter((q) => selectedIds.has(q.player_id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Queue</h2>
        <Button variant={selectionMode ? "outline" : "ghost"} size="sm" onClick={toggleSelectionMode}>
          {selectionMode ? (
            <>
              <X className="h-3.5 w-3.5" />
              Cancel
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5" />
              Lock Players
            </>
          )}
        </Button>
      </div>

      {selectionMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border p-3 text-sm">
          {selectedIds.size === 2 ? (
            <>
              <span className="text-muted-foreground">2 players selected</span>
              <Button size="sm" loading={locking} onClick={handleLockPartners}>
                <Users className="h-3.5 w-3.5" />
                Lock as Partners
              </Button>
            </>
          ) : selectedIds.size === 4 ? (
            <>
              <span className="text-muted-foreground">4 players selected</span>
              <Button size="sm" onClick={() => setTeamModalOpen(true)}>
                <Lock className="h-3.5 w-3.5" />
                Lock Full Match
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground">
              Select exactly 2 players to lock as partners, or 4 to lock a full match
              {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}.
            </span>
          )}
        </div>
      )}

      {queue.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No one is waiting"
          description="Players will appear here as soon as they join the queue."
        />
      ) : (
        <div className="space-y-3">
          {queue.map((entry, i) => (
            <QueueEntryRow
              key={entry.queue_id}
              entry={entry}
              position={i + 1}
              lockType={lockedById.get(entry.player_id)?.lock_type as LockType | undefined ?? null}
              onUnlock={() => {
                const lockedSetId = lockedById.get(entry.player_id)?.locked_set_id;
                if (lockedSetId) handleUnlock(lockedSetId);
              }}
              selectable={selectionMode}
              selected={selectedIds.has(entry.player_id)}
              onToggleSelect={() => toggleSelected(entry.player_id)}
            />
          ))}
        </div>
      )}

      <LockTeamAssignModal
        open={teamModalOpen}
        onOpenChange={setTeamModalOpen}
        sessionId={sessionId}
        players={selectedPlayers.map((p) => ({ player_id: p.player_id, display_name: p.display_name }))}
        onLocked={() => { setTeamModalOpen(false); exitSelection(); onChanged(); }}
      />
    </div>
  );
}
