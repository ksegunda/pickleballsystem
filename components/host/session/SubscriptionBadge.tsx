import { Ban, CalendarClock, Crown, Zap } from "lucide-react";
import { formatSubscriptionPlan, formatExpiryCountdown } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { SubscriptionPlan, SubscriptionStatus } from "@/types/database.types";

interface SubscriptionBadgeProps {
  planType:  SubscriptionPlan;
  status:    SubscriptionStatus;
  used:      number;
  limit:     number | null;
  expiresAt: string | null;
}

const PLAN_ICON: Record<SubscriptionPlan, typeof Zap> = {
  free:     Zap,
  monthly:  CalendarClock,
  lifetime: Crown,
};

// Status wins over plan for color — "cancelled"/"expired" need to read as
// urgent regardless of which plan they're on; only "active" shows the
// plan's own identity color. Exported so the admin panel's host list can
// use the exact same mapping for visual consistency between both views.
export function getSubscriptionBadgeStyle(status: SubscriptionStatus, planType: SubscriptionPlan): string {
  if (status === "cancelled") return "bg-destructive/10 text-destructive";
  if (status === "expired") return "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  const activeStyles: Record<SubscriptionPlan, string> = {
    free:     "bg-muted text-muted-foreground",
    monthly:  "bg-primary/10 text-primary",
    lifetime: "bg-accent/20 text-accent-foreground",
  };
  return activeStyles[planType];
}

export function SubscriptionBadge({ planType, status, used, limit, expiresAt }: SubscriptionBadgeProps) {
  const Icon = status === "cancelled" ? Ban : PLAN_ICON[planType];

  return (
    <div className="text-right">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
          getSubscriptionBadgeStyle(status, planType)
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {formatSubscriptionPlan(planType)}
        {status !== "active" && (
          <span className="font-normal opacity-80">· {status === "cancelled" ? "Cancelled" : "Expired"}</span>
        )}
        {status === "active" && planType === "free" && limit !== null && (
          <span className="font-normal opacity-70">· {used}/{limit} this month</span>
        )}
      </span>
      {planType === "monthly" && expiresAt && (
        <p className="mt-1 text-xs text-muted-foreground">{formatExpiryCountdown(expiresAt)}</p>
      )}
    </div>
  );
}
