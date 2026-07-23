"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, Shuffle, Users, X } from "lucide-react";
import { createLockedSetAction, deleteLockedSetAction, shuffleQueueAction } from "@/actions/match.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { QueueEntryRow } from "@/components/host/queue/QueueEntryRow";
import { EmptyState } from "@/components/shared/EmptyState";
import { LockTeamAssignModal } from "./LockTeamAssignModal";
import { LockedGroupCard, type LockedGroupMember } from "./LockedGroupCard";
import type { Database, LockType } from "@/types/database.types";
import type { LockedPlayerRow } from "@/types/match.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

interface QueueLockControlsProps {
  sessionId:     string;
  queue:         QueueRow[];
  lockedPlayers: LockedPlayerRow[];
  onChanged:     () => void;
}

type DisplayUnit =
  | { kind: "single"; entry: QueueRow; rank: number }
  | { kind: "group"; lockedSetId: string; lockType: LockType; members: LockedGroupMember[]; rank: number };

export function QueueLockControls({ sessionId, queue, lockedPlayers, onChanged }: QueueLockControlsProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [locking, setLocking]             = useState(false);
  const [shuffleDialogOpen, setShuffleDialogOpen] = useState(false);
  const [shuffling, setShuffling]                 = useState(false);

  // True individual rank — same priority_score DESC, entered_queue ASC
  // ordering the matchmaker itself uses — independent of how locked
  // groups get visually clustered below. A locked player's badge still
  // shows their real position, never a fabricated shared one.
  const rankByPlayerId = useMemo(() => {
    const ranked = [...queue].sort((a, b) => {
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return new Date(a.entered_queue).getTime() - new Date(b.entered_queue).getTime();
    });
    return new Map(ranked.map((q, i) => [q.player_id, i + 1]));
  }, [queue]);

  // Group locked players by locked_set_id, then build one combined list of
  // "display units" (a group counts as one unit) sorted by each unit's
  // best-ranked member, so a group sits wherever its most-eligible member
  // would've ranked alone instead of jumping to the top/bottom arbitrarily.
  const units = useMemo(() => {
    const queueById = new Map(queue.map((q) => [q.player_id, q]));
    const groupsById = new Map<string, { lockType: LockType; playerIds: Set<string> }>();

    for (const lp of lockedPlayers) {
      if (!groupsById.has(lp.locked_set_id)) {
        groupsById.set(lp.locked_set_id, { lockType: lp.lock_type as LockType, playerIds: new Set() });
      }
      groupsById.get(lp.locked_set_id)!.playerIds.add(lp.player_id);
    }

    const consumed = new Set<string>();
    const result: DisplayUnit[] = [];

    for (const [lockedSetId, group] of groupsById) {
      const members: LockedGroupMember[] = Array.from(group.playerIds)
        .map((pid) => queueById.get(pid))
        .filter((entry): entry is QueueRow => !!entry)
        .map((entry) => ({ entry, rank: rankByPlayerId.get(entry.player_id) ?? Number.MAX_SAFE_INTEGER }))
        .sort((a, b) => a.rank - b.rank);

      if (members.length === 0) continue; // none of this lock's members are currently waiting
      members.forEach((m) => consumed.add(m.entry.player_id));
      result.push({ kind: "group", lockedSetId, lockType: group.lockType, members, rank: members[0].rank });
    }

    for (const entry of queue) {
      if (consumed.has(entry.player_id)) continue;
      result.push({ kind: "single", entry, rank: rankByPlayerId.get(entry.player_id) ?? Number.MAX_SAFE_INTEGER });
    }

    return result.sort((a, b) => a.rank - b.rank);
  }, [queue, lockedPlayers, rankByPlayerId]);

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
      toast.success("Locked as partners — guaranteed the same team every match, until you unlock them.");
      exitSelection();
      onChanged();
    } catch {
      toast.error("Could not lock these players. Please try again.");
    } finally {
      setLocking(false);
    }
  }

  const selectedPlayers = queue.filter((q) => selectedIds.has(q.player_id));

  async function handleShuffle() {
    setShuffling(true);
    try {
      const result = await shuffleQueueAction(sessionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Queue shuffled.");
      setShuffleDialogOpen(false);
      onChanged();
    } catch {
      toast.error("Could not shuffle the queue. Please try again.");
    } finally {
      setShuffling(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Queue</h2>
        <div className="flex items-center gap-1">
          {!selectionMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShuffleDialogOpen(true)}
              disabled={queue.length < 2}
            >
              <Shuffle className="h-3.5 w-3.5" />
              Shuffle
            </Button>
          )}
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
          {units.map((unit) =>
            unit.kind === "group" ? (
              <LockedGroupCard
                key={unit.lockedSetId}
                lockType={unit.lockType}
                members={unit.members}
                onUnlock={() => handleUnlock(unit.lockedSetId)}
              />
            ) : (
              <QueueEntryRow
                key={unit.entry.queue_id}
                entry={unit.entry}
                position={unit.rank}
                selectable={selectionMode}
                selected={selectedIds.has(unit.entry.player_id)}
                onToggleSelect={() => toggleSelected(unit.entry.player_id)}
              />
            )
          )}
        </div>
      )}

      <LockTeamAssignModal
        open={teamModalOpen}
        onOpenChange={setTeamModalOpen}
        sessionId={sessionId}
        players={selectedPlayers.map((p) => ({ player_id: p.player_id, display_name: p.display_name }))}
        onLocked={() => { setTeamModalOpen(false); exitSelection(); onChanged(); }}
      />

      <Dialog open={shuffleDialogOpen} onOpenChange={setShuffleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shuffle the queue?</DialogTitle>
            <DialogDescription>
              This randomly reorders everyone currently waiting, resetting their fair wait-time
              order. Players locked as partners or a full match keep their relative order within
              their group. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShuffleDialogOpen(false)} disabled={shuffling}>
              Cancel
            </Button>
            <Button onClick={handleShuffle} loading={shuffling}>
              <Shuffle className="h-4 w-4" />
              Shuffle Queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
