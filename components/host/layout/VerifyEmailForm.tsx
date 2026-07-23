"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { verifyEmailOtpAction, resendEmailOtpAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { maskEmail } from "@/lib/utils/format";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECS = 45;

interface VerifyEmailFormProps {
  email:      string;
  onVerified: () => void;
  onBack:     () => void;
}

// Only ever rendered inside AuthModal, from LoginForm/RegisterForm — never
// a standalone page.
export function VerifyEmailForm({ email, onVerified, onBack }: VerifyEmailFormProps) {
  const [code, setCode]           = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [cooldown, setCooldown]   = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleVerify(value: string) {
    if (value.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const result = await verifyEmailOtpAction(email, value);
      if (!result.success) {
        console.error("[VerifyEmailForm] verifyEmailOtpAction failed:", result.error);
        setError(typeof result.error === "string" && result.error ? result.error : "Something went wrong. Please try again.");
        setCode("");
        return;
      }
      onVerified();
    } catch (err) {
      console.error("[VerifyEmailForm] unexpected verify error:", err);
      setError("Something went wrong. Please try again.");
      setCode("");
    } finally {
      setVerifying(false);
    }
  }

  function handleCodeChange(value: string) {
    setCode(value);
    setError(null);
    if (value.length === OTP_LENGTH) handleVerify(value);
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      const result = await resendEmailOtpAction(email);
      if (!result.success) {
        console.error("[VerifyEmailForm] resendEmailOtpAction failed:", result.error);
        toast.error(typeof result.error === "string" && result.error ? result.error : "Could not resend the code. Please try again.");
        return;
      }
      toast.success("Code resent — check your inbox.");
      setCooldown(RESEND_COOLDOWN_SECS);
      setCode("");
      setError(null);
    } catch (err) {
      console.error("[VerifyEmailForm] unexpected resend error:", err);
      toast.error("Could not resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <CardHeader className="items-center px-0 pb-4 pt-0 text-center">
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-5 w-5 text-primary" />
        </div>
        <CardTitle className="text-xl">Verify your email</CardTitle>
        <CardDescription>
          We sent a 6-digit code to <span className="font-medium text-foreground">{maskEmail(email)}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 px-0">
        <OtpInput
          length={OTP_LENGTH}
          value={code}
          onChange={handleCodeChange}
          disabled={verifying}
          autoFocus
        />
        {error && (
          <p className="text-center text-xs text-destructive">{error}</p>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-3 px-0 pb-0 pt-2">
        <Button
          className="w-full"
          size="lg"
          loading={verifying}
          disabled={code.length !== OTP_LENGTH}
          onClick={() => handleVerify(code)}
        >
          Verify
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t get it?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
          </button>
        </p>

        <button
          type="button"
          onClick={onBack}
          className="text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Use a different email
        </button>
      </CardFooter>
    </div>
  );
}
