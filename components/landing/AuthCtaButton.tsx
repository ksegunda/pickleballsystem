"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { AuthModal, type AuthMode } from "./AuthModal";

interface AuthCtaButtonProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
  mode: AuthMode;
}

// Each instance owns its own modal — cheap, and only one can ever be open
// at a time anyway since opening one is a direct user click on that exact
// button. Keeps app/page.tsx a plain server component; this is the only
// interactive piece.
export function AuthCtaButton({ mode, children, ...buttonProps }: AuthCtaButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button {...buttonProps} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <AuthModal open={open} onOpenChange={setOpen} initialMode={mode} />
    </>
  );
}
