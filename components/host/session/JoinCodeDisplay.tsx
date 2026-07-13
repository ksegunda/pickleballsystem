"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants/routes";

interface JoinCodeDisplayProps {
  joinCode:  string;
  sessionId: string;
}

export function JoinCodeDisplay({ joinCode, sessionId }: JoinCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const joinUrl = typeof window !== "undefined"
    ? `${window.location.origin}${ROUTES.JOIN_CODE(joinCode)}`
    : ROUTES.JOIN_CODE(joinCode);

  async function copyCode() {
    await navigator.clipboard.writeText(joinCode);
    setCopied(true);
    toast.success("Join code copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(joinUrl);
    toast.success("Join link copied!");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Join Code</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {joinCode.split("").map((char, i) => (
              <div
                key={i}
                className="flex h-12 w-10 items-center justify-center rounded-xl bg-muted text-xl font-bold font-mono text-foreground"
              >
                {char}
              </div>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={copyCode} className="shrink-0">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Share this code with players. They can visit{" "}
          <span className="font-mono text-foreground">openplay.app/join</span>{" "}
          and enter the code.
        </p>

        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={copyLink}>
          <ExternalLink className="h-3.5 w-3.5" />
          Copy direct link
        </Button>
      </CardContent>
    </Card>
  );
}
