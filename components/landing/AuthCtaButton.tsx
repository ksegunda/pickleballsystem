"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "./AuthModalProvider";
import type { AuthMode } from "./AuthModal";

interface AuthCtaButtonProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
  mode: AuthMode;
}

// Opens the one shared modal (see AuthModalProvider) — no local modal
// state here anymore, since the modal also needs to be openable from a
// server redirect's ?auth= param, not just a button click.
export function AuthCtaButton({ mode, children, ...buttonProps }: AuthCtaButtonProps) {
  const { openAuthModal } = useAuthModal();

  return (
    <Button {...buttonProps} onClick={() => openAuthModal(mode)}>
      {children}
    </Button>
  );
}
