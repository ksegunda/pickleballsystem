"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, CalendarClock, Crown, ShieldAlert, ShieldCheck, Pencil, Zap } from "lucide-react";
import { updateHostSubscriptionAction, toggleHostSuspensionAction, type AdminHostRow as AdminHostRowType } from "@/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSubscriptionBadgeStyle } from "@/components/host/session/SubscriptionBadge";
import { formatDate, formatExpiryCountdown } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { SubscriptionPlan, SubscriptionStatus } from "@/types/database.types";

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: "Free", monthly: "Monthly", lifetime: "Lifetime",
};
const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Active", expired: "Expired", cancelled: "Cancelled",
};
const PLAN_ICON: Record<SubscriptionPlan, typeof Zap> = {
  free: Zap, monthly: CalendarClock, lifetime: Crown,
};

// "Expired" only ever makes sense for Monthly — Free is a rolling limit
// with no end date, Lifetime has none by definition (also enforced at the
// DB layer, migration 029, in case this ever gets bypassed some other way).
const STATUS_OPTIONS_BY_PLAN: Record<SubscriptionPlan, SubscriptionStatus[]> = {
  free:     ["active", "cancelled"],
  monthly:  ["active", "expired", "cancelled"],
  lifetime: ["active", "cancelled"],
};

interface AdminHostRowProps {
  host: AdminHostRowType;
}

export function AdminHostRow({ host }: AdminHostRowProps) {
  const [editOpen, setEditOpen]   = useState(false);
  const [planType, setPlanType]   = useState<SubscriptionPlan>(host.plan_type);
  const [status, setStatus]       = useState<SubscriptionStatus>(host.status);
  const [expiresAt, setExpiresAt] = useState(host.expires_at ? host.expires_at.slice(0, 10) : "");
  const [sessionLimit, setSessionLimit] = useState(host.session_limit);
  const [saving, setSaving]       = useState(false);
  const [togglingSuspend, setTogglingSuspend] = useState(false);

  const statusOptions = STATUS_OPTIONS_BY_PLAN[planType];

  // Switching to a plan that doesn't support the currently-picked status
  // (e.g. Monthly+Expired -> Free) — fall back to Active rather than let
  // the form hold an about-to-be-invalid combination.
  useEffect(() => {
    if (!statusOptions.includes(status)) setStatus("active");
  }, [planType, status, statusOptions]);

  const RowIcon = host.status === "cancelled" ? Ban : PLAN_ICON[host.plan_type];

  async function handleSave() {
    setSaving(true);
    try {
      const iso = planType === "lifetime" || !expiresAt ? null : new Date(expiresAt).toISOString();
      const result = await updateHostSubscriptionAction(host.id, planType, status, iso, sessionLimit);
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
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              getSubscriptionBadgeStyle(host.status, host.plan_type)
            )}
          >
            <RowIcon className="h-3 w-3" />
            {PLAN_LABELS[host.plan_type]} · {STATUS_LABELS[host.status]}
          </span>
          {host.plan_type === "monthly" && host.expires_at && (
            <p className="mt-1 text-xs text-muted-foreground">{formatExpiryCountdown(host.expires_at)}</p>
          )}
          {host.plan_type === "free" && (
            <p className="mt-1 text-xs text-muted-foreground">Limit: {host.session_limit}/month</p>
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
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {planType !== "monthly" && (
                <p className="text-xs text-muted-foreground">
                  {PLAN_LABELS[planType]} has no expiry date, so "Expired" isn't an option — only Active or Cancelled.
                </p>
              )}
            </div>

            {planType === "monthly" && (
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

            {planType === "free" && (
              <div className="space-y-1.5">
                <Label htmlFor="session_limit">Session Limit (per month)</Label>
                <Input
                  id="session_limit"
                  type="number"
                  min={1}
                  step={1}
                  value={sessionLimit}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setSessionLimit(Number.isFinite(n) && n >= 1 ? n : 1);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  How many sessions this specific host can create per calendar month. Set this per host —
                  there's no single fixed limit for every Free plan host.
                </p>
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
