import { TriangleAlert } from "lucide-react";
import type { SubscriptionBlockReason } from "@/repositories/subscription.repository";

interface SubscriptionLimitBannerProps {
  reason: SubscriptionBlockReason;
  used:   number;
  limit:  number | null;
}

export function SubscriptionLimitBanner({ reason, used, limit }: SubscriptionLimitBannerProps) {
  if (!reason) return null;

  const isCancelled = reason === "cancelled";

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div>
        <p className="text-sm font-semibold text-foreground">
          {isCancelled ? "Subscription cancelled" : "Free plan limit reached"}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {isCancelled
            ? "Your subscription has been cancelled. Please contact support to resubscribe and continue creating sessions."
            : `You've used your free session${limit === 1 ? "" : "s"} for this month (${used}/${limit}). Upgrade to Monthly or Lifetime for unlimited sessions.`}
        </p>
      </div>
    </div>
  );
}
