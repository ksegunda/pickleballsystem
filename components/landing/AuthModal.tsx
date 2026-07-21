"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoginForm } from "@/components/host/layout/LoginForm";
import { RegisterForm } from "@/components/host/layout/RegisterForm";
import { cn } from "@/lib/utils/cn";

export type AuthMode = "login" | "register";

interface AuthModalProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  initialMode:  AuthMode;
}

// The whole login/create-account experience lives in this one modal — no
// navigation to /login or /register happens from the landing page anymore.
// Both forms are reused as-is (compact mode strips their own logo/Card
// chrome, which this modal supplies instead) so validation/submit logic
// never had to change, only presentation.
export function AuthModal({ open, onOpenChange, initialMode }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  function handleOpenChange(next: boolean) {
    if (next) setMode(initialMode);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="sr-only">
          {mode === "login" ? "Host Login" : "Create Host Account"}
        </DialogTitle>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={cn(
              "rounded-lg py-2 text-sm font-semibold transition-colors",
              mode === "login" ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={cn(
              "rounded-lg py-2 text-sm font-semibold transition-colors",
              mode === "register" ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Create Account
          </button>
        </div>

        <div className="overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {mode === "login" ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <LoginForm onSwitchToRegister={() => setMode("register")} />
              </motion.div>
            ) : (
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <RegisterForm onSwitchToLogin={() => setMode("login")} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
