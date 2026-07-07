import type { PlayerStatus, CourtStatus, MatchStatus, SessionStatus } from "@/types/database.types";

export const PLAYER_STATUS_LABELS: Record<PlayerStatus, string> = {
  waiting:  "Waiting",
  playing:  "Playing",
  resting:  "Resting",
  offline:  "Offline",
};

export const COURT_STATUS_LABELS: Record<CourtStatus, string> = {
  available:   "Available",
  occupied:    "In Use",
  maintenance: "Maintenance",
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  pending:     "Ready",
  in_progress: "Live",
  completed:   "Finished",
  cancelled:   "Cancelled",
  forecasted:  "Reserved",
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  pending:  "Not Started",
  active:   "Active",
  paused:   "Paused",
  ended:    "Ended",
  archived: "Archived",
};

// Algorithm weight defaults
export const DEFAULT_WEIGHTS = {
  waiting_time: 0.40,
  games_played: 0.35,
  performance:  0.25,
} as const;

// Pickleball is always doubles (4 players per match)
export const PLAYERS_PER_MATCH = 4;
export const PLAYERS_PER_TEAM  = 2;

// How many candidates to pull from queue before running algorithm
export const CANDIDATE_POOL_MULTIPLIER = 2; // 4 × 2 = 8 candidates
