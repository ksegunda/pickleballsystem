import type { Database, SessionStatus } from "./database.types";

export type Session        = Database["public"]["Tables"]["sessions"]["Row"];
export type SessionInsert  = Database["public"]["Tables"]["sessions"]["Insert"];
export type SessionUpdate  = Database["public"]["Tables"]["sessions"]["Update"];
export type SessionSummary = Database["public"]["Views"]["session_summary_view"]["Row"];
export type SessionSettings = Database["public"]["Tables"]["session_settings"]["Row"];

export interface CreateSessionInput {
  club_name:        string;
  session_name:     string;
  session_date:     string;
  start_time:       string;
  end_time?:        string;
  number_of_courts: number;
  max_players?:     number | null;
  settings?: {
    theme?:                 string;
    dark_mode?:             boolean;
    language?:              string;
    allow_late_join?:       boolean;
    games_to_win?:          number;
    match_format?:          "singles" | "doubles";
    weight_waiting_time?:   number;
    weight_games_played?:   number;
    weight_performance?:    number;
    anti_repeat_threshold?: number;
  };
}

export interface UpdateSessionInput {
  id:      string;
  status?: SessionStatus;
  started_at?: string;
  ended_at?:   string;
}

export type SessionWithSummary = Session & {
  summary?: SessionSummary;
};

export interface SessionReportCourtStat {
  courtName:     string;
  matchesPlayed: number;
}

export interface SessionReportLeaderboardRow {
  rank:         number;
  displayName:  string;
  wins:         number;
  losses:       number;
  gamesPlayed:  number;
  winRate:      number;
}

export interface SessionReportData {
  clubName:             string;
  sessionName:          string;
  sessionDate:          string;
  startTime:            string;
  endTime:              string | null;
  generatedAt:          string;
  totalPlayers:         number;
  totalMatches:         number;
  avgMatchDurationSecs: number | null;
  sessionDurationSecs:  number | null;
  courts:               SessionReportCourtStat[];
  leaderboard:          SessionReportLeaderboardRow[];
}
