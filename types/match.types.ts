import type { Database, TeamSide, MatchStatus, MatchResult } from "./database.types";

export type Match       = Database["public"]["Tables"]["matches"]["Row"];
export type MatchInsert = Database["public"]["Tables"]["matches"]["Insert"];
export type MatchPlayer = Database["public"]["Tables"]["match_players"]["Row"];
export type CourtView   = Database["public"]["Views"]["court_status_view"]["Row"];
export type Court       = Database["public"]["Tables"]["courts"]["Row"];
export type ForecastRow = Database["public"]["Views"]["forecast_pool_view"]["Row"];
export type MatchHistoryRow = Database["public"]["Views"]["match_history_view"]["Row"];

export interface TeamAssignment {
  team_a: string[];  // player IDs
  team_b: string[];
}

export interface MatchAssignment {
  session_id:   string;
  court_id:     string;
  match_number: number;
  team_a:       string[];
  team_b:       string[];
}

export interface MatchWithPlayers extends Match {
  players: Array<MatchPlayer & { display_name: string }>;
  court_name: string;
}

export interface FinishMatchInput {
  match_id:    string;
  winner_team: TeamSide;
}

export interface MatchEligibility {
  playersPerMatch:  number;
  waitingCount:     number;
  hasEnoughPlayers: boolean;
}

export interface ForecastSet {
  matchId:   string | null;
  setNumber: number;
  // Travels with the row regardless of its visual position — auto/manual
  // reshuffle together in creation-time order (see Bug 5), so this is the
  // only thing display code should use to tell them apart, never position.
  isManual:  boolean;
  players:   Array<{ player_id: string; display_name: string; team: TeamSide }>;
  missing:   number;
}

export interface MatchPlayerView {
  player_id:    string;
  display_name: string;
  games_played: number;
  wins:         number;
  win_rate:     number;
}

export interface CurrentMatchView {
  court_id:     string | null;
  court_name:   string | null;
  court_number: number | null;
  match_id:     string;
  match_status: MatchStatus;
  started_at:   string | null;
  me:           MatchPlayerView;
  partner:      MatchPlayerView | null;
  opponents:    MatchPlayerView[];
}

export interface MatchHistoryEntry {
  matchId:     string;
  matchNumber: number;
  courtName:   string;
  startedAt:   string | null;
  endedAt:     string | null;
  result:      MatchResult | null;
  partner:     string | null;
  opponents:   string[];
}
