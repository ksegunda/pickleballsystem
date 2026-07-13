"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck, Pencil } from "lucide-react";
import { updateHostSubscriptionAction, toggleHostSuspensionAction, type AdminHostRow as AdminHostRowType } from "@/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils/format";
import type { SubscriptionPlan, SubscriptionStatus } from "@/types/database.types";

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: "Free", monthly: "Monthly", lifetime: "Lifetime",
};
const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Active", expired: "Expired", cancelled: "Cancelled",
};

interface AdminHostRowProps {
  host: AdminHostRowType;
}

export function AdminHostRow({ host }: AdminHostRowProps) {
  const [editOpen, setEditOpen]   = useState(false);
  const [planType, setPlanType]   = useState<SubscriptionPlan>(host.plan_type);
  const [status, setStatus]       = useState<SubscriptionStatus>(host.status);
  const [expiresAt, setExpiresAt] = useState(host.expires_at ? host.expires_at.slice(0, 10) : "");
  const [saving, setSaving]       = useState(false);
  const [togglingSuspend, setTogglingSuspend] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const iso = planType === "lifetime" || !expiresAt ? null : new Date(expiresAt).toISOString();
      const result = await updateHostSubscriptionAction(host.id, planType, status, iso);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Subscription updated.");
      setEditOpen(false);
    } catch {
      toast.error("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleSuspend() {
    setTogglingSuspend(true);
    try {
      const result = await toggleHostSuspensionAction(host.id, !host.is_suspended);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(host.is_suspended ? "Host unsuspended." : "Host suspended.");
    } catch {
      toast.error("Could not update account status. Please try again.");
    } finally {
      setTogglingSuspend(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground truncate">{host.club_name ?? host.name}</p>
            {host.is_suspended && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">Suspended</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{host.name} · {host.email}</p>
          <p className="text-xs text-muted-foreground">Joined {formatDate(host.created_at.slice(0, 10))}</p>
        </div>

        <div className="text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {PLAN_LABELS[host.plan_type]} · {STATUS_LABELS[host.status]}
          </span>
          {host.expires_at && (
            <p className="mt-1 text-xs text-muted-foreground">Expires {formatDate(host.expires_at.slice(0, 10))}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit Plan
          </Button>
          <Button
            variant={host.is_suspended ? "outline" : "outline"}
            size="sm"
            loading={togglingSuspend}
            onClick={handleToggleSuspend}
            className={host.is_suspended ? "" : "text-destructive hover:text-destructive"}
          >
            {host.is_suspended ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            {host.is_suspended ? "Unsuspend" : "Suspend"}
          </Button>
        </div>
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>{host.club_name ?? host.name} — manually set after payment is confirmed outside the app.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={planType} onValueChange={(v) => setPlanType(v as SubscriptionPlan)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="lifetime">Lifetime</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as SubscriptionStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {planType !== "lifetime" && (
              <div className="space-y-1.5">
                <Label htmlFor="expires_at">Expires On</Label>
                <Input
                  id="expires_at"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
