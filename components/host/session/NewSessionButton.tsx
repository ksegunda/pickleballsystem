import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants/routes";
import type { SubscriptionBlockReason } from "@/repositories/subscription.repository";

interface NewSessionButtonProps {
  allowed: boolean;
  reason:  SubscriptionBlockReason;
  label?:  string;
}

// The full explanation lives in the SubscriptionLimitBanner right above —
// this button just needs to visibly refuse to work, with a short reason
// available on hover for anyone who skipped the banner.
const SHORT_REASON: Record<Exclude<SubscriptionBlockReason, null>, string> = {
  cancelled:  "Subscription cancelled — see above to resubscribe.",
  free_limit: "Free plan limit reached this month.",
};

export function NewSessionButton({ allowed, reason, label = "New Session" }: NewSessionButtonProps) {
  if (!allowed) {
    return (
      <Button disabled title={reason ? SHORT_REASON[reason] : undefined}>
        <Plus className="h-4 w-4" />
        {label}
      </Button>
    );
  }

  return (
    <Button asChild>
      <Link href={ROUTES.NEW_SESSION}>
        <Plus className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
