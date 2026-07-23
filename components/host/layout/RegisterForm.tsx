"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { registerSchema, type RegisterSchema } from "@/lib/validations/auth.schema";
import { registerAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyEmailForm } from "./VerifyEmailForm";

interface RegisterFormProps {
  // Only ever rendered inside AuthModal now (no standalone /register page
  // anymore) — switching to the login tab is always an in-modal state
  // change, never a real navigation.
  onSwitchToLogin: () => void;
}

export function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Set once signup succeeds and Supabase actually requires verification —
  // swaps the whole form out for the OTP step, in place, no navigation.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterSchema>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterSchema) {
    setIsLoading(true);
    try {
      const result = await registerAction(data);
      if (!result.success) {
        console.error("[RegisterForm] registerAction failed:", result.error);
        toast.error(typeof result.error === "string" && result.error ? result.error : "Something went wrong. Please try again.");
        return;
      }
      if (result.data.needsVerification) {
        setPendingEmail(data.email);
      } else {
        // "Confirm email" is off — signUp() already returned an active
        // session, nothing to verify.
        router.push("/sessions");
      }
    } catch (err) {
      console.error("[RegisterForm] unexpected error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (pendingEmail) {
    return (
      <VerifyEmailForm
        email={pendingEmail}
        onVerified={() => router.push("/sessions")}
        onBack={() => setPendingEmail(null)}
      />
    );
  }

  return (
    <div>
      <CardHeader className="px-0 pb-4 pt-0">
        <CardTitle className="text-xl">Create host account</CardTitle>
        <CardDescription>Manage open play sessions for your club</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4 px-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="Full Name"
                autoComplete="name"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club_name">Club Name</Label>
              <Input
                id="club_name"
                placeholder="Pickleball Club"
                {...register("club_name")}
              />
              {errors.club_name && (
                <p className="text-xs text-destructive">{errors.club_name.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="host@yourclub.com"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="pr-11"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm_password">Confirm Password</Label>
            <Input
              id="confirm_password"
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter password"
              autoComplete="new-password"
              {...register("confirm_password")}
            />
            {errors.confirm_password && (
              <p className="text-xs text-destructive">{errors.confirm_password.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 px-0 pb-0 pt-2">
          <Button type="submit" className="w-full" size="lg" loading={isLoading}>
            Create Account
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </button>
          </p>
        </CardFooter>
      </form>
    </div>
  );
}
