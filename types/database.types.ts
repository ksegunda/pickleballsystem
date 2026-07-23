// Auto-generated Supabase database types
// Run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SessionStatus = "pending" | "active" | "paused" | "ended" | "archived";
export type PlayerStatus  = "waiting" | "playing" | "resting" | "offline";
export type CourtStatus   = "available" | "occupied" | "maintenance";
export type MatchStatus   = "pending" | "in_progress" | "completed" | "cancelled" | "forecasted";
export type TeamSide      = "team_a" | "team_b";
export type MatchResult   = "win" | "loss";
export type QueueStatus   = "waiting" | "matched" | "removed" | "resting";
export type PlayerLevel   = "all_levels" | "beginner" | "intermediate" | "advanced";
export type SubscriptionPlan   = "free" | "monthly" | "lifetime";
export type SubscriptionStatus = "active" | "expired" | "cancelled";
export type LockType = "partner_pair" | "full_match";

export interface Database {
  public: {
    Tables: {
      hosts: {
        Row: {
          id:           string;
          email:        string;
          name:         string;
          club_name:    string | null;
          avatar_url:   string | null;
          is_suspended: boolean;
          created_at:   string;
        };
        Insert: {
          id?:           string;
          email:         string;
          name:          string;
          club_name?:    string | null;
          avatar_url?:   string | null;
          is_suspended?: boolean;
          created_at?:   string;
        };
        Update: Partial<Database["public"]["Tables"]["hosts"]["Insert"]>;
        Relationships: [];
      };
      platform_admins: {
        Row: {
          id:         string;
          created_at: string;
        };
        Insert: {
          id:          string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["platform_admins"]["Insert"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id:            string;
          host_id:       string;
          plan_type:     SubscriptionPlan;
          status:        SubscriptionStatus;
          session_limit: number;
          started_at:    string;
          expires_at:    string | null;
          updated_at:    string;
        };
        Insert: {
          id?:            string;
          host_id:        string;
          plan_type?:     SubscriptionPlan;
          status?:        SubscriptionStatus;
          session_limit?: number;
          started_at?:    string;
          expires_at?:    string | null;
          updated_at?:    string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id:                string;
          host_id:           string;
          club_name:         string;
          session_name:      string;
          session_date:      string;
          start_time:        string;
          end_time:          string | null;
          number_of_courts:  number;
          max_players:       number | null;
          status:            SessionStatus;
          join_code:         string;
          qr_code_data:      string | null;
          created_at:        string;
          started_at:        string | null;
          ended_at:          string | null;
        };
        Insert: {
          id?:               string;
          host_id:           string;
          club_name:         string;
          session_name:      string;
          session_date:      string;
          start_time:        string;
          end_time?:         string | null;
          number_of_courts:  number;
          max_players?:      number | null;
          status?:           SessionStatus;
          join_code?:        string;
          qr_code_data?:     string | null;
          created_at?:       string;
          started_at?:       string | null;
          ended_at?:         string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
        Relationships: [];
      };
      session_settings: {
        Row: {
          id:                    string;
          session_id:            string;
          theme:                 string;
          dark_mode:             boolean;
          language:              string;
          allow_late_join:       boolean;
          games_to_win:          number;
          match_format:          string;
          weight_waiting_time:   number;
          weight_games_played:   number;
          weight_performance:    number;
          anti_repeat_threshold: number;
          player_level:          PlayerLevel;
          target_forecast_count: number;
          updated_at:            string;
        };
        Insert: {
          id?:                    string;
          session_id:             string;
          theme?:                 string;
          dark_mode?:             boolean;
          language?:              string;
          allow_late_join?:       boolean;
          games_to_win?:          number;
          match_format?:          string;
          weight_waiting_time?:   number;
          weight_games_played?:   number;
          weight_performance?:    number;
          anti_repeat_threshold?: number;
          player_level?:          PlayerLevel;
          target_forecast_count?: number;
          updated_at?:            string;
        };
        Update: Partial<Database["public"]["Tables"]["session_settings"]["Insert"]>;
        Relationships: [];
      };
      courts: {
        Row: {
          id:           string;
          session_id:   string;
          court_number: number;
          court_name:   string;
          status:       CourtStatus;
          created_at:   string;
        };
        Insert: {
          id?:           string;
          session_id:    string;
          court_number:  number;
          court_name:    string;
          status?:       CourtStatus;
          created_at?:   string;
        };
        Update: Partial<Database["public"]["Tables"]["courts"]["Insert"]>;
        Relationships: [];
      };
      players: {
        Row: {
          id:           string;
          session_id:   string;
          display_name: string;
          status:       PlayerStatus;
          device_token: string | null;
          joined_at:    string;
          last_active:  string;
          is_active:    boolean;
        };
        Insert: {
          id?:           string;
          session_id:    string;
          display_name:  string;
          status?:       PlayerStatus;
          device_token?: string | null;
          joined_at?:    string;
          last_active?:  string;
          is_active?:    boolean;
        };
        Update: Partial<Database["public"]["Tables"]["players"]["Insert"]>;
        Relationships: [];
      };
      queue_entries: {
        Row: {
          id:             string;
          session_id:     string;
          player_id:      string;
          position:       number | null;
          priority_score: number;
          entered_queue:  string;
          status:         QueueStatus;
        };
        Insert: {
          id?:             string;
          session_id:      string;
          player_id:       string;
          position?:       number | null;
          priority_score?: number;
          entered_queue?:  string;
          status?:         QueueStatus;
        };
        Update: Partial<Database["public"]["Tables"]["queue_entries"]["Insert"]>;
        Relationships: [];
      };
      matches: {
        Row: {
          id:           string;
          session_id:   string;
          court_id:     string | null;
          match_number: number;
          status:       MatchStatus;
          winner_team:  TeamSide | null;
          started_at:   string | null;
          ended_at:     string | null;
          created_at:   string;
          is_manual:    boolean;
        };
        Insert: {
          id?:           string;
          session_id:    string;
          court_id?:     string | null;
          match_number:  number;
          status?:       MatchStatus;
          winner_team?:  TeamSide | null;
          started_at?:   string | null;
          ended_at?:     string | null;
          created_at?:   string;
          is_manual?:    boolean;
        };
        Update: Partial<Database["public"]["Tables"]["matches"]["Insert"]>;
        Relationships: [];
      };
      match_players: {
        Row: {
          id:        string;
          match_id:  string;
          player_id: string;
          team:      TeamSide;
          result:    MatchResult | null;
        };
        Insert: {
          id?:        string;
          match_id:   string;
          player_id:  string;
          team:       TeamSide;
          result?:    MatchResult | null;
        };
        Update: Partial<Database["public"]["Tables"]["match_players"]["Insert"]>;
        Relationships: [];
      };
      player_statistics: {
        Row: {
          id:                    string;
          player_id:             string;
          session_id:            string;
          games_played:          number;
          wins:                  number;
          losses:                number;
          current_win_streak:    number;
          longest_win_streak:    number;
          current_losing_streak: number;
          total_wait_secs:       number;
          last_played_at:        string | null;
          last_entered_queue:    string | null;
          updated_at:            string;
        };
        Insert: {
          id?:                    string;
          player_id:              string;
          session_id:             string;
          games_played?:          number;
          wins?:                  number;
          losses?:                number;
          current_win_streak?:    number;
          longest_win_streak?:    number;
          current_losing_streak?: number;
          total_wait_secs?:       number;
          last_played_at?:        string | null;
          last_entered_queue?:    string | null;
          updated_at?:            string;
        };
        Update: Partial<Database["public"]["Tables"]["player_statistics"]["Insert"]>;
        Relationships: [];
      };
      partner_history: {
        Row: {
          id:               string;
          session_id:       string;
          player_id:        string;
          partner_id:       string;
          times_partnered:  number;
          last_partnered:   string;
        };
        Insert: {
          id?:               string;
          session_id:        string;
          player_id:         string;
          partner_id:        string;
          times_partnered?:  number;
          last_partnered?:   string;
        };
        Update: Partial<Database["public"]["Tables"]["partner_history"]["Insert"]>;
        Relationships: [];
      };
      opponent_history: {
        Row: {
          id:           string;
          session_id:   string;
          player_id:    string;
          opponent_id:  string;
          times_faced:  number;
          last_faced:   string;
        };
        Insert: {
          id?:           string;
          session_id:    string;
          player_id:     string;
          opponent_id:   string;
          times_faced?:  number;
          last_faced?:   string;
        };
        Update: Partial<Database["public"]["Tables"]["opponent_history"]["Insert"]>;
        Relationships: [];
      };
      reports: {
        Row: {
          id:           string;
          session_id:   string;
          generated_at: string;
          data:         Json;
          pdf_url:      string | null;
          excel_url:    string | null;
        };
        Insert: {
          id?:           string;
          session_id:    string;
          generated_at?: string;
          data:          Json;
          pdf_url?:      string | null;
          excel_url?:    string | null;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
        Relationships: [];
      };
      locked_sets: {
        Row: {
          id:         string;
          session_id: string;
          lock_type:  LockType;
          created_at: string;
        };
        Insert: {
          id?:         string;
          session_id:  string;
          lock_type:   LockType;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["locked_sets"]["Insert"]>;
        Relationships: [];
      };
      locked_set_players: {
        Row: {
          locked_set_id: string;
          player_id:     string;
          team:          TeamSide | null;
        };
        Insert: {
          locked_set_id: string;
          player_id:     string;
          team?:         TeamSide | null;
        };
        Update: Partial<Database["public"]["Tables"]["locked_set_players"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      queue_with_stats: {
        Row: {
          queue_id:             string;
          session_id:           string;
          player_id:            string;
          position:             number | null;
          priority_score:       number;
          entered_queue:        string;
          queue_status:         QueueStatus;
          display_name:         string;
          player_status:        PlayerStatus;
          games_played:         number;
          wins:                 number;
          losses:               number;
          win_rate:             number;
          current_win_streak:   number;
          longest_win_streak:   number;
          current_losing_streak: number;
          waiting_secs:         number;
        };
        Relationships: [];
      };
      leaderboard_view: {
        Row: {
          player_id:            string;
          session_id:           string;
          display_name:         string;
          player_status:        PlayerStatus;
          games_played:         number;
          wins:                 number;
          losses:               number;
          win_rate:             number;
          current_win_streak:   number;
          longest_win_streak:   number;
          current_losing_streak: number;
          last_played_at:       string | null;
          rank:                 number;
        };
        Relationships: [];
      };
      court_status_view: {
        Row: {
          court_id:      string;
          session_id:    string;
          court_name:    string;
          court_number:  number;
          court_status:  CourtStatus;
          match_id:      string | null;
          match_number:  number | null;
          match_status:  MatchStatus | null;
          started_at:    string | null;
          winner_team:   TeamSide | null;
          elapsed_secs:  number | null;
          players:       Json;
        };
        Relationships: [];
      };
      forecast_pool_view: {
        Row: {
          match_id:      string;
          session_id:    string;
          match_number:  number;
          created_at:    string;
          is_manual:     boolean;
          players:       Json;
        };
        Relationships: [];
      };
      match_history_view: {
        Row: {
          match_id:      string;
          session_id:    string;
          match_number:  number;
          court_name:    string;
          started_at:    string | null;
          ended_at:      string | null;
          winner_team:   TeamSide | null;
          players:       Json;
        };
        Relationships: [];
      };
      locked_players_view: {
        Row: {
          session_id:    string;
          locked_set_id: string;
          lock_type:     LockType;
          created_at:    string;
          player_id:     string;
          team:          TeamSide | null;
        };
        Relationships: [];
      };
      session_summary_view: {
        Row: {
          session_id:              string;
          session_name:            string;
          club_name:               string;
          status:                  SessionStatus;
          session_date:            string;
          started_at:              string | null;
          join_code:               string;
          number_of_courts:        number;
          total_players:           number;
          players_waiting:         number;
          players_playing:         number;
          matches_completed:       number;
          matches_in_progress:     number;
          courts_available:        number;
          avg_match_duration_secs: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      generate_join_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      count_sessions_this_month: {
        Args: { p_host_id: string };
        Returns: number;
      };
      calculate_priority_score: {
        Args: { p_player_id: string; p_session_id: string };
        Returns: number;
      };
      recalculate_queue_positions: {
        Args: { p_session_id: string };
        Returns: void;
      };
      recalculate_priority_scores: {
        Args: { p_session_id: string };
        Returns: void;
      };
      generate_match: {
        Args: { p_session_id: string; p_court_id?: string | null };
        Returns: string | null;
      };
      start_match: {
        Args: { p_match_id: string };
        Returns: boolean;
      };
      forecast_next_sets: {
        Args: { p_session_id: string };
        Returns: void;
      };
      assign_forecast_to_free_courts: {
        Args: { p_session_id: string };
        Returns: void;
      };
      finish_match: {
        Args: { p_match_id: string; p_winner_team: TeamSide };
        Returns: boolean;
      };
      get_session_fairness_score: {
        Args: { p_session_id: string };
        Returns: Json;
      };
      create_session_courts: {
        Args: { p_session_id: string; p_num_courts: number };
        Returns: void;
      };
      get_next_match_number: {
        Args: { p_session_id: string };
        Returns: number;
      };
      end_session: {
        Args: { p_session_id: string };
        Returns: boolean;
      };
      leave_session: {
        Args: { p_player_id: string; p_device_token?: string | null };
        Returns: boolean;
      };
      set_resting: {
        Args: { p_player_id: string; p_resting: boolean; p_device_token?: string | null };
        Returns: boolean;
      };
      update_match_teams: {
        Args: { p_match_id: string; p_team_a: string[]; p_team_b: string[] };
        Returns: boolean;
      };
      create_manual_match: {
        Args: { p_session_id: string; p_team_a: string[]; p_team_b: string[] };
        Returns: string | null;
      };
      create_locked_set: {
        Args: { p_session_id: string; p_lock_type: string; p_players: string[]; p_teams?: TeamSide[] | null };
        Returns: string | null;
      };
      delete_locked_set: {
        Args: { p_locked_set_id: string };
        Returns: boolean;
      };
      shuffle_queue: {
        Args: { p_session_id: string };
        Returns: void;
      };
      increment_forecast_target: {
        Args: { p_session_id: string };
        Returns: void;
      };
      remove_forecast_set: {
        Args: { p_match_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      session_status: SessionStatus;
      player_status:  PlayerStatus;
      court_status:   CourtStatus;
      match_status:   MatchStatus;
      team_side:      TeamSide;
      match_result:   MatchResult;
      queue_entry_status: QueueStatus;
      player_level:       PlayerLevel;
      subscription_plan:   SubscriptionPlan;
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
