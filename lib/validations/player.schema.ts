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

export type JoinSessionSchema    = z.infer<typeof joinSessionSchema>;
