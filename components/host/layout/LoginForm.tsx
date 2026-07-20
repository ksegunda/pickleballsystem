"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { loginSchema, type LoginSchema } from "@/lib/validations/auth.schema";
import { loginAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyEmailForm } from "./VerifyEmailForm";
import { cn } from "@/lib/utils/cn";

interface LoginFormProps {
  // Used inside AuthModal: renders without the outer logo block/Card
  // chrome (the modal itself supplies that framing) and swaps the
  // "Create account" link for an in-modal tab switch instead of a real
  // navigation. Standalone /login usage (no props) is unchanged.
  compact?:            boolean;
  onSwitchToRegister?: () => void;
}

export function LoginForm({ compact = false, onSwitchToRegister }: LoginFormProps = {}) {
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
        compact={compact}
        onVerified={() => router.push("/sessions")}
        onBack={() => setPendingEmail(null)}
      />
    );
  }

  const formBody = (
    <form onSubmit={handleSubmit(onSubmit)}>
      <CardContent className={cn("space-y-4", compact && "px-0")}>
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

      <CardFooter className={cn("flex flex-col gap-4 pt-2", compact && "px-0 pb-0")}>
        <Button type="submit" className="w-full" size="lg" loading={isLoading}>
          Sign In
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          {onSwitchToRegister ? (
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="font-medium text-primary hover:underline"
            >
              Create account
            </button>
          ) : (
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create account
            </Link>
          )}
        </p>
      </CardFooter>
    </form>
  );

  if (compact) {
    return (
      <div>
        <CardHeader className="px-0 pb-4 pt-0">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your host account</CardDescription>
        </CardHeader>
        {formBody}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-foreground">PaddleSync</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Pickleball Queue Management</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your host account</CardDescription>
        </CardHeader>
        {formBody}
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Players don&apos;t need an account — just scan the QR code your host shows at the venue.
      </p>
    </motion.div>
  );
}
