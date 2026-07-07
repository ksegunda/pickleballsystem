import { z } from "zod";

export const joinSessionSchema = z.object({
  display_name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(30, "Name must be under 30 characters")
    .regex(/^[a-zA-Z0-9 '_.-]+$/, "Name can only contain letters, numbers, spaces, and . _ ' -")
    .transform((v) => v.trim()),
  join_code: z
    .string()
    .length(6, "Join code must be exactly 6 characters")
    .toUpperCase(),
  device_token: z.string().uuid("Invalid device token"),
});

export const enterJoinCodeSchema = z.object({
  join_code: z
    .string()
    .min(1, "Enter your 6-character join code")
    .length(6, "Join code must be exactly 6 characters")
    .toUpperCase(),
});

export type JoinSessionSchema    = z.infer<typeof joinSessionSchema>;
export type EnterJoinCodeSchema  = z.infer<typeof enterJoinCodeSchema>;
