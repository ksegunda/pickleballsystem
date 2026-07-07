import type { PlayerIdentity } from "@/types/player.types";

export const PLAYER_KEY = (sessionId: string) => `openplay_player_${sessionId}`;

export function getStoredPlayerIdentity(sessionId: string): PlayerIdentity | null {
  const stored = localStorage.getItem(PLAYER_KEY(sessionId));
  if (!stored) return null;
  try {
    return JSON.parse(stored) as PlayerIdentity;
  } catch {
    return null;
  }
}
