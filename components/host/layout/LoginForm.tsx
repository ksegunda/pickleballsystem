"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { loginSchema, type LoginSchema } from "@/lib/validations/auth.schema";
import { loginAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyEmailForm } from "./VerifyEmailForm";

interface LoginFormProps {
  // Only ever rendered inside AuthModal now (no standalone /login page
  // anymore) — switching to the register tab is always an in-modal state
  // change, never a real navigation.
  onSwitchToRegister: () => void;
}

export function LoginForm({ onSwitchToRegister }: LoginFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Set when loginAction reports the account exists but was never
  // email-verified — swaps in the OTP step instead of a dead-end error.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginSchema) {
    setIsLoading(true);
    try {
      const result = await loginAction(data);
      if (!result.success) {
        if (result.needsVerification) {
          setPendingEmail(data.email);
          return;
        }
        toast.error(result.error);
        return;
      }
      router.push("/sessions");
    } catch {
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
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your host account</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4 px-0">
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
                placeholder="••••••••"
                autoComplete="current-password"
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
        </CardContent>

        <CardFooter className="flex flex-col gap-4 px-0 pb-0 pt-2">
          <Button type="submit" className="w-full" size="lg" loading={isLoading}>
            Sign In
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="font-medium text-primary hover:underline"
            >
              Create account
            </button>
          </p>
        </CardFooter>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Players don&apos;t need an account — just scan the QR code your host shows at the venue.
      </p>
    </div>
  );
}
