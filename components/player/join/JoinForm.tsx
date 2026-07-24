"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { User, ArrowRight, Users, Calendar } from "lucide-react";
import { generateDeviceToken } from "@/lib/utils/generate-code";
import { getStoredPlayerIdentity, setStoredPlayerIdentity } from "@/lib/utils/player-identity";
import { formatDate, formatTime, formatPlayerLevel } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants/routes";
import type { Session } from "@/types/session.types";
import type { PlayerLevel } from "@/types/database.types";

const DEVICE_TOKEN_KEY = "openplay_device_token";

interface JoinFormProps {
  session:        Session;
  playerLevel?:   PlayerLevel | null;
  // The host's own uploaded club logo (hosts.avatar_url), shown above the
  // "Join Open Play" heading. Null when the host hasn't uploaded one.
  hostAvatarUrl?: string | null;
}

export function JoinForm({ session, playerLevel, hostAvatarUrl }: JoinFormProps) {
  const router = useRouter();
  const [name, setName]         = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string>("");

  // Get or create device token
  useEffect(() => {
    let token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) {
      token = generateDeviceToken();
      localStorage.setItem(DEVICE_TOKEN_KEY, token);
    }
    setDeviceToken(token);

    // Already joined (or mid-join) this session — go straight there.
    if (getStoredPlayerIdentity(session.id)) {
      router.replace(ROUTES.PLAY(session.id));
    }
  }, [session.id, router]);

  // Optimistic: no network call here at all. Write the intent to join
  // locally and navigate immediately — the destination page is the sole
  // place that actually calls the join Server Action and owns retrying,
  // so there's only ever one in-flight attempt per pending identity.
  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (!deviceToken) {
      setError("Unable to identify your device. Please refresh and try again.");
      return;
    }

    setError(null);
    setStoredPlayerIdentity(session.id, {
      player_id:    null,
      session_id:   session.id,
      display_name: name.trim(),
      device_token: deviceToken,
      pending:      true,
    });
    router.push(ROUTES.PLAY(session.id));
  }

  return (
    <motion.div
      className="w-full max-w-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-6 text-center">
        {hostAvatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hostAvatarUrl}
            alt=""
            className="mx-auto mb-2 h-14 w-14 rounded-2xl object-cover shadow-card"
          />
        )}
        {hostAvatarUrl && (
          <p className="text-xs font-bold uppercase tracking-wide text-primary">{session.club_name}</p>
        )}
        <h1 className="mt-1 text-xl font-bold text-foreground">Join Open Play</h1>
        <p className="mt-1 text-sm text-muted-foreground">You&apos;ve been invited to join</p>
      </div>

      {/* Session info card */}
      <Card className="mb-4 border-primary/20 bg-primary/5">
        <CardContent className="p-4 space-y-2">
          <p className="font-bold text-foreground text-lg">{session.session_name}</p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {session.club_name}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(session.session_date)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatTime(session.start_time)}
            {session.end_time ? ` – ${formatTime(session.end_time)}` : ""}
            {" "}&middot; {session.number_of_courts} court{session.number_of_courts !== 1 ? "s" : ""}
          </p>
          {playerLevel && (
            <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {formatPlayerLevel(playerLevel)}
            </span>
          )}
        </CardContent>
      </Card>

      {/* Join form */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>What&apos;s your name?</CardTitle>
          <CardDescription>
            This will be shown on the leaderboard and queue.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleJoin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null); }}
                  maxLength={30}
                  className="pl-10 text-base h-12"
                  autoFocus
                  autoComplete="name"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <Button type="submit" className="w-full" size="lg">
              Join Queue
              <ArrowRight className="h-4 w-4" />
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              No account required &middot; Guest mode only
            </p>
          </CardContent>
        </form>
      </Card>
    </motion.div>
  );
}
