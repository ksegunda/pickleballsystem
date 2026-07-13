import type { Database } from "./database.types";

export type Player           = Database["public"]["Tables"]["players"]["Row"];
export type PlayerInsert     = Database["public"]["Tables"]["players"]["Insert"];
export type PlayerStatistics = Database["public"]["Tables"]["player_statistics"]["Row"];
export type LeaderboardEntry = Database["public"]["Views"]["leaderboard_view"]["Row"];
export type QueueEntry       = Database["public"]["Tables"]["queue_entries"]["Row"];
export type QueueWithStats   = Database["public"]["Views"]["queue_with_stats"]["Row"];

export interface JoinSessionInput {
  session_id:   string;
  display_name: string;
  device_token: string;
}

export interface PlayerWithStats extends Player {
  statistics?: PlayerStatistics;
  queue_entry?: QueueEntry;
  queue_position?: number;
}

export interface PlayerIdentity {
  player_id:    string | null; // null while an optimistic join hasn't been confirmed yet
  session_id:   string;
  display_name: string;
  device_token: string;
  pending?:     boolean;
}
