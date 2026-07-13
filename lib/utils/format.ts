import { formatDistanceToNow, format, parseISO } from "date-fns";
import type { PlayerLevel, SubscriptionPlan } from "@/types/database.types";

const PLAYER_LEVEL_LABELS: Record<PlayerLevel, string> = {
  all_levels:   "All Levels",
  beginner:     "Beginner",
  intermediate: "Intermediate",
  advanced:     "Advanced",
};

export function formatPlayerLevel(level: PlayerLevel): string {
  return PLAYER_LEVEL_LABELS[level];
}

const SUBSCRIPTION_PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free:     "Free Plan",
  monthly:  "Monthly Plan",
  lifetime: "Lifetime Plan",
};

export function formatSubscriptionPlan(plan: SubscriptionPlan): string {
  return SUBSCRIPTION_PLAN_LABELS[plan];
}

export function formatWaitTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTime(timeStr: string): string {
  // Input: "HH:MM" → "12:30 PM"
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), "EEE, MMM d, yyyy");
}

export function formatDateShort(dateStr: string): string {
  return format(parseISO(dateStr), "MMM d");
}

export function timeAgo(dateStr: string): string {
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
}

export function formatWinRate(wins: number, gamesPlayed: number): string {
  if (gamesPlayed === 0) return "—";
  return `${Math.round((wins / gamesPlayed) * 100)}%`;
}

export function formatTimerDisplay(elapsedSecs: number): string {
  const m = Math.floor(elapsedSecs / 60);
  const s = elapsedSecs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
