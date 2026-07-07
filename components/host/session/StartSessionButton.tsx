"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { startSessionAction } from "@/actions/session.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

interface StartSessionButtonProps {
  sessionId: string;
}

export function StartSessionButton({ sessionId }: StartSessionButtonProps) {
  const router   = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const result = await startSessionAction(sessionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Session started! Players can now join and the queue is live.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to start session.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="default">
          <Play className="h-4 w-4" />
          Start Session
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Open Play Session?</DialogTitle>
          <DialogDescription>
            This will open the queue for players to join. Courts will be created and
            the session will go live. Players can start scanning the QR code or entering
            the join code immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleStart} loading={loading}>
            <Play className="h-4 w-4" />
            Start Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
