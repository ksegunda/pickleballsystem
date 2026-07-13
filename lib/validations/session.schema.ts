import { z } from "zod";

export const createSessionSchema = z.object({
  session_name: z
    .string()
    .min(2, "Session name must be at least 2 characters")
    .max(100, "Session name must be under 100 characters"),
  session_date: z
    .string()
    .min(1, "Date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  start_time: z
    .string()
    .min(1, "Start time is required")
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
  end_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
    .optional()
    .or(z.literal("")),
  number_of_courts: z
    .number({ invalid_type_error: "Must be a number" })
    .int()
    .min(1, "At least 1 court required")
    .max(20, "Maximum 20 courts"),
  max_players: z
    .number({ invalid_type_error: "Must be a number" })
    .int()
    .positive("Must be a positive number")
    .optional()
    .nullable(),
  settings: z.object({
    theme:                  z.enum(["light", "dark"]).default("light"),
    language:               z.string().default("en"),
    allow_late_join:        z.boolean().default(true),
    games_to_win:           z.number().int().min(1).max(21).default(11),
    match_format:           z.enum(["singles", "doubles"]).default("doubles"),
    player_level:           z.enum(["all_levels", "beginner", "intermediate", "advanced"]).default("all_levels"),
    anti_repeat_threshold:  z.number().int().min(1).max(10).default(3),
  }),
}).refine(
  (data) => {
    if (!data.end_time || data.end_time === "") return true;
    return data.end_time > data.start_time;
  },
  { message: "End time must be after start time", path: ["end_time"] }
);

export type CreateSessionSchema = z.infer<typeof createSessionSchema>;
