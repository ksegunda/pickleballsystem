"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/auth";
import { loginSchema, registerSchema } from "@/lib/validations/auth.schema";
import type { LoginSchema, RegisterSchema } from "@/lib/validations/auth.schema";
import type { Database } from "@/types/database.types";

type Host = Database["public"]["Tables"]["hosts"]["Row"];

export type ActionResult<T = null> =
  | { success: true;  data: T;    error?: never }
  | { success: false; error: string; data?: never };

// Supabase's client only ever *returns* an { error } for expected auth
// rejections (wrong password, duplicate email, bad OTP) — it throws for
// anything more fundamental (network failure, misconfiguration, an
// unexpected API shape). An uncaught throw out of a Server Action gets
// redacted by Next.js in production before it reaches the client, which
// can otherwise surface as a near-empty, unreadable object client-side
// instead of a real message. console.error here is what actually lets you
// see the real cause (Vercel function logs / terminal) — the string this
// returns is only ever the user-facing fallback.
function toErrorMessage(err: unknown, context: string): string {
  console.error(`[auth.actions] ${context}:`, err);
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Something went wrong. Please try again.";
}

// Distinct from ActionResult specifically to carry needsVerification —
// the one caller (LoginForm) needs to tell "wrong password" apart from
// "right password, but this email was never confirmed" so it can show
// the OTP screen instead of a dead-end error toast.
export type LoginResult =
  | { success: true; data: null }
  | { success: false; error: string; needsVerification?: boolean };

export async function loginAction(formData: LoginSchema): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email:    parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      console.error("[loginAction] signInWithPassword error:", error);
      if (error.message === "Email not confirmed") {
        return {
          success: false,
          error: "Please verify your email first.",
          needsVerification: true,
        };
      }
      return {
        success: false,
        error: error.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : error.message,
      };
    }

    revalidatePath("/", "layout");
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: toErrorMessage(err, "loginAction") };
  }
}

export type RegisterResult =
  | { success: true;  data: { needsVerification: boolean } }
  | { success: false; error: string };

export async function registerAction(formData: RegisterSchema): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  try {
    const supabase = await createClient();

    // Create auth user
    const { data, error } = await supabase.auth.signUp({
      email:    parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          name:      parsed.data.name,
          club_name: parsed.data.club_name || null,
        },
      },
    });

    if (error) {
      console.error("[registerAction] signUp error:", error);
      // Supabase deliberately doesn't say "this email is already
      // registered" (account enumeration protection) — it returns a user
      // object with no error and no new identity instead. This branch is
      // for genuine signUp failures: rate limits, weak password rejected
      // server-side, SMTP/provider errors, etc.
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: "Account creation failed. Please try again." };
    }

    // The `hosts` row is auto-provisioned by a trigger (migration 006,
    // retimed by 027/028) — either immediately (if "Confirm email" is off,
    // Supabase marks the row confirmed at INSERT and there's no session to
    // wait on) or once verifyEmailOtpAction confirms it. Either way, no
    // action needed here.

    // signUp() only returns an active session immediately when Supabase's
    // "Confirm email" setting is off — in that case the user is already
    // fully signed in and there's nothing to verify, so don't show the OTP
    // screen (it would wait forever for an email Supabase never sends).
    revalidatePath("/", "layout");
    return { success: true, data: { needsVerification: !data.session } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err, "registerAction") };
  }
}

export async function verifyEmailOtpAction(email: string, token: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });

    if (error) {
      console.error("[verifyEmailOtpAction] verifyOtp error:", error);
      return {
        success: false,
        error: /expired|invalid/i.test(error.message)
          ? "That code is invalid or expired. Please request a new one."
          : error.message,
      };
    }

    revalidatePath("/", "layout");
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: toErrorMessage(err, "verifyEmailOtpAction") };
  }
}

export async function resendEmailOtpAction(email: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });

    if (error) {
      console.error("[resendEmailOtpAction] resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: toErrorMessage(err, "resendEmailOtpAction") };
  }
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function getHostAction(): Promise<Host | null> {
  const user = await getVerifiedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: host } = await supabase
    .from("hosts")
    .select("*")
    .eq("id", user.id)
    .single();

  return host as Host | null;
}
