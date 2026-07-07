"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Square } from "lucide-react";
import { toast } from "sonner";
import { endSessionAction } from "@/actions/session.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ROUTES } from "@/lib/constants/routes";

interface EndSessionButtonProps {
  sessionId: string;
}

function downloadPdf(base64: string, fileName: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function EndSessionButton({ sessionId }: EndSessionButtonProps) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleEnd() {
    setLoading(true);
    try {
      const result = await endSessionAction(sessionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      downloadPdf(result.data.pdfBase64, result.data.fileName);
      toast.success("Session ended. Report downloaded — player data has been removed.");
      setOpen(false);
      router.push(ROUTES.SESSIONS);
    } catch {
      toast.error("Failed to end session.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Square className="h-4 w-4" />
          End Session
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this session?</DialogTitle>
          <DialogDescription>
            This will generate a final report and permanently remove player data from this
            session. Your session record and the report stay in &quot;All Sessions&quot; —
            but every guest player, match, and queue entry will be deleted and cannot be
            recovered. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleEnd} loading={loading}>
            <Square className="h-4 w-4" />
            End Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
