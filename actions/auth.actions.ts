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

export async function loginAction(formData: LoginSchema): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email:    parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      success: false,
      error: error.message === "Invalid login credentials"
        ? "Incorrect email or password."
        : error.message,
    };
  }

  revalidatePath("/", "layout");
  return { success: true, data: null };
}

export async function registerAction(formData: RegisterSchema): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

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
    return { success: false, error: error.message };
  }

  if (!data.user) {
    return { success: false, error: "Account creation failed. Please try again." };
  }

  // The `hosts` row is auto-provisioned by the trg_handle_new_host trigger
  // (migration 006) when the auth.users row is created above.

  revalidatePath("/", "layout");
  return { success: true, data: null };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
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
