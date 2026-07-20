"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSessionAction } from "@/actions/session.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface DeleteSessionButtonProps {
  sessionId:   string;
  sessionName: string;
}

export function DeleteSessionButton({ sessionId, sessionName }: DeleteSessionButtonProps) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const result = await deleteSessionAction(sessionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Session deleted.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to delete session.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        title="Delete session"
        className="text-muted-foreground hover:text-destructive"
        onClick={(e) => { e.preventDefault(); setOpen(true); }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &quot;{sessionName}&quot;?</DialogTitle>
          <DialogDescription>
            This permanently deletes this session and everything in it — every player,
            match, and stat. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} loading={loading}>
            <Trash2 className="h-4 w-4" />
            Delete Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
