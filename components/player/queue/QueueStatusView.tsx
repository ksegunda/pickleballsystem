"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Clock, Users, RefreshCw, Coffee, LogOut, CheckCircle2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getPlayerContextAction, getCurrentMatchAction, leaveSessionAction, setRestingAction,
  joinSessionByIdAction,
} from "@/actions/player.actions";
import { useElapsedSeconds } from "@/lib/hooks/useElapsedSeconds";
import {
  getStoredPlayerIdentity, setStoredPlayerIdentity, clearStoredPlayerIdentity,
} from "@/lib/utils/player-identity";
import { formatWaitTime } from "@/lib/utils/format";
import { PlayerStatusBadge } from "@/components/shared/StatusBadge";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { LastSyncedIndicator } from "@/components/shared/LastSyncedIndicator";
import { CurrentMatchCard } from "@/components/player/match/CurrentMatchCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ROUTES } from "@/lib/constants/routes";
import type { Session } from "@/types/session.types";
import type { PlayerWithStats } from "@/types/player.types";
import type { CurrentMatchView } from "@/types/match.types";
import type { PlayerIdentity } from "@/types/player.types";

interface QueueStatusViewProps {
  session: Session;
}

type SyncState = "idle" | "syncing" | "synced" | "error";

// Tuned for "I just tapped a button," not server-load-shedding — a few
// quick attempts, not a long exponential tail.
const MAX_SYNC_ATTEMPTS = 4;
const SYNC_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

export function QueueStatusView({ session }: QueueStatusViewProps) {
  const router = useRouter();
  const [player, setPlayer]           = useState<PlayerWithStats | null>(null);
  const [currentMatch, setCurrentMatch] = useState<CurrentMatchView | null>(null);
  const [loading, setLoading]         = useState(true);
  const [identity, setIdentity]       = useState<PlayerIdentity | null>(null);
  const [leaveOpen, setLeaveOpen]     = useState(false);
  const [actionLoading, setActionLoading] = useState<"leave" | "rest" | null>(null);
  const [syncState, setSyncState]     = useState<SyncState>("idle");
  const [syncError, setSyncError]     = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const hasStartedSync = useRef(false);
  const cancelledRef    = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPlayer = useCallback(async () => {
    const stored = getStoredPlayerIdentity(session.id);
    setIdentity(stored);
    const playerId = stored?.player_id ?? null;
    if (!playerId) {
      setLoading(false);
      return;
    }

    const [ctx, match] = await Promise.all([
      getPlayerContextAction(playerId, session.id),
      getCurrentMatchAction(playerId, session.id),
    ]);
    if (ctx) {
      setPlayer(ctx as PlayerWithStats);
    }
    setCurrentMatch(match);
    setLoading(false);
    setLastSyncedAt(new Date());
  }, [session.id]);

  useEffect(() => {
    loadPlayer();
  }, [loadPlayer]);

  // Confirms an optimistic join in the background. Only ever called from
  // this page (JoinForm no longer calls the join action itself) — the
  // device-token unique index is what actually makes concurrent attempts
  // (two tabs, Fast Refresh) safe; this is just the happy-path client.
  const attemptJoin = useCallback(async (pending: PlayerIdentity, attempt: number) => {
    if (cancelledRef.current) return;
    setSyncState("syncing");
    try {
      const result = await joinSessionByIdAction(session.id, pending.display_name, pending.device_token);
      if (cancelledRef.current) return;

      if (!result.success) {
        // Permanent rejection (name taken, session closed, etc.) — retrying
        // the exact same request would just fail again the same way.
        setSyncState("error");
        setSyncError(result.error);
        return;
      }

      const confirmed: PlayerIdentity = {
        ...pending,
        player_id: result.data.player.id,
        pending:   false,
      };
      setStoredPlayerIdentity(session.id, confirmed);
      setIdentity(confirmed);
      setSyncState("synced");
      await loadPlayer();
    } catch {
      if (cancelledRef.current) return;
      if (attempt >= MAX_SYNC_ATTEMPTS) {
        setSyncState("error");
        setSyncError("Could not connect. Check your connection and try again.");
        return;
      }
      const delay = SYNC_RETRY_DELAYS_MS[attempt - 1] ?? SYNC_RETRY_DELAYS_MS[SYNC_RETRY_DELAYS_MS.length - 1];
      retryTimeoutRef.current = setTimeout(() => attemptJoin(pending, attempt + 1), delay);
    }
  }, [session.id, loadPlayer]);

  // Fires the optimistic-join confirmation exactly once per mounted
  // instance. cancelledRef is reset unconditionally on every run of this
  // effect (not just the run that fires the request) — React's dev-only
  // Strict Mode mounts, cleans up, and re-mounts every component once;
  // resetting only inside the "should I fire" branch would leave the
  // *original* in-flight request permanently cancelled once the real
  // mount lands, since the guarded branch never runs a second time.
  useEffect(() => {
    cancelledRef.current = false;
    const stored = getStoredPlayerIdentity(session.id);
    if (stored?.pending && !hasStartedSync.current) {
      hasStartedSync.current = true;
      attemptJoin(stored, 1);
    }
    return () => {
      cancelledRef.current = true;
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [session.id, attemptJoin]);

  function handleManualRetry() {
    if (!identity) return;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    attemptJoin(identity, 1);
  }

  function handleBackToJoin() {
    clearStoredPlayerIdentity(session.id);
    router.push(ROUTES.JOIN);
  }

  async function handleLeave() {
    if (!identity?.player_id) return;
    setActionLoading("leave");
    try {
      const result = await leaveSessionAction(identity.player_id, identity.device_token);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      clearStoredPlayerIdentity(session.id);
      toast.success("You've left the session.");
      router.push(ROUTES.JOIN);
    } catch {
      toast.error("Could not leave the session. Please try again.");
    } finally {
      setActionLoading(null);
      setLeaveOpen(false);
    }
  }

  async function handleToggleRest() {
    if (!identity?.player_id) return;
    const wasResting = player?.status === "resting";
    setActionLoading("rest");
    try {
      const result = await setRestingAction(identity.player_id, !wasResting, identity.device_token);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(wasResting ? "You're back in the queue!" : "You're resting — sit tight.");
      await loadPlayer();
    } catch {
      toast.error("Could not update your status. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  // Realtime: session-wide queue/match changes (position shifts, match generated/started/finished)
  // plus this specific player's own rows, so status flips and match assignment/result reach them
  // directly instead of relying only on the session-wide events landing at the right time.
  // playerId comes from `identity` state (not a fresh localStorage read) specifically so this
  // effect re-runs and re-subscribes once an optimistic join resolves to a real id — otherwise
  // the player-scoped filters would stay permanently unsubscribed for the rest of this page's life.
  useEffect(() => {
    const playerId = identity?.player_id ?? null;
    const supabase = createClient();
    const channel  = supabase.channel(`session:${session.id}:play-status`);

    for (const table of ["queue_entries", "matches"]) {
      channel.on("postgres_changes", {
        event:  "*",
        schema: "public",
        table,
        filter: `session_id=eq.${session.id}`,
      }, () => loadPlayer());
    }

    if (playerId) {
      channel.on("postgres_changes", {
        event: "*", schema: "public", table: "players", filter: `id=eq.${playerId}`,
      }, () => loadPlayer());

      channel.on("postgres_changes", {
        event: "*", schema: "public", table: "match_players", filter: `player_id=eq.${playerId}`,
      }, () => loadPlayer());
    }

    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session.id, loadPlayer, identity?.player_id]);

  const position = player?.queue_position ?? null;
  const waitSecs = useElapsedSeconds(player?.queue_entry?.entered_queue, position !== null);
  const syncSecs = useElapsedSeconds(lastSyncedAt?.toISOString(), lastSyncedAt !== null);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-56 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Optimistic state: identity is a real, confirmed-truthy record the
  // instant JoinForm writes it, well before the server has ever heard of
  // this player — show "joined" immediately, with a small sync indicator
  // reflecting the background confirmation instead of the normal queue UI.
  if (identity?.pending) {
    return (
      <div className="px-5 pt-6 pb-2 space-y-5 max-w-md mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">{session.session_name}</h1>
            <p className="text-sm text-muted-foreground">{session.club_name}</p>
          </div>
          <LiveIndicator />
        </div>

        <div className="flex flex-col items-center gap-4 py-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex h-44 w-44 items-center justify-center rounded-full bg-primary/10 shadow-card"
          >
            <CheckCircle2 className="h-16 w-16 text-primary" />
          </motion.div>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">You&apos;re in, {identity.display_name}!</p>
            <p className="text-sm text-muted-foreground">Confirming your spot in the queue…</p>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium">
            {syncState === "error" ? (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Sync failed
              </span>
            ) : syncState === "synced" ? (
              <span className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Synced
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Syncing…
              </span>
            )}
          </div>

          {syncState === "syncing" && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={handleManualRetry}>
              Taking a while? Retry now
            </Button>
          )}

          {syncState === "error" && (
            <div className="flex flex-col items-center gap-3">
              <p className="max-w-xs text-center text-sm text-destructive">{syncError}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleManualRetry}>
                  Try Again
                </Button>
                <Button size="sm" variant="ghost" onClick={handleBackToJoin}>
                  Back to Join
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-2 space-y-5 max-w-md mx-auto">
      {/* Session header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">{session.session_name}</h1>
          <p className="text-sm text-muted-foreground">{session.club_name}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <LiveIndicator />
          {player && lastSyncedAt && (
            <LastSyncedIndicator variant="prominent" secondsSinceSync={syncSecs} />
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {currentMatch ? (
          <motion.div
            key="match"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CurrentMatchCard match={currentMatch} />
          </motion.div>
        ) : (
          <motion.div
            key="queue"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* Main queue position badge */}
            <div className="flex flex-col items-center py-6">
              <AnimatePresence mode="wait">
                {position !== null ? (
                  <motion.div
                    key={`pos-${position}`}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="queue-position-badge">
                      <span>#{position}</span>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-foreground">Your Queue Position</p>
                      <p className="text-sm text-muted-foreground">
                        {position === 1
                          ? "You're next up!"
                          : position <= 4
                          ? "Almost there!"
                          : `${position - 1} players ahead of you`}
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="offline" className="flex flex-col items-center gap-3">
                    <div className="flex h-44 w-44 items-center justify-center rounded-full bg-muted shadow-card">
                      <Users className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-sm">Not in queue</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Status card */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <PlayerStatusBadge status={player?.status ?? "offline"} />
                </div>
                {position !== null && waitSecs > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Waiting
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatWaitTime(waitSecs)}</span>
                  </div>
                )}
                {player && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span className="text-sm font-semibold">{player.display_name}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Today's stats mini */}
      {player?.statistics && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Games",  value: player.statistics.games_played },
            { label: "Wins",   value: player.statistics.wins },
            { label: "Win %",  value: player.statistics.games_played > 0
              ? `${Math.round((player.statistics.wins / player.statistics.games_played) * 100)}%`
              : "—"
            },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-foreground tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {player && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleRest}
            disabled={player.status === "playing" || actionLoading !== null}
            loading={actionLoading === "rest"}
          >
            <Coffee className="h-4 w-4" />
            {player.status === "resting" ? "I'm Back" : "Rest"}
          </Button>

          <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={player.status === "playing" || actionLoading !== null}
              >
                <LogOut className="h-4 w-4" />
                Leave
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Leave this session?</DialogTitle>
                <DialogDescription>
                  You&apos;ll be taken off the queue and back to the join screen. You can scan
                  the QR code or enter the join code again later, but you&apos;ll lose your
                  current queue position.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setLeaveOpen(false)}
                  disabled={actionLoading === "leave"}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleLeave} loading={actionLoading === "leave"}>
                  <LogOut className="h-4 w-4" />
                  Leave Session
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={loadPlayer}>
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );
}
