import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getHostAction } from "@/actions/auth.actions";
import { HostProfileForm } from "@/components/host/session/HostProfileForm";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Settings" };

export default async function HostSettingsPage() {
  const host = await getHostAction();
  if (!host) redirect(ROUTES.LOGIN_REDIRECT);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link
          href={ROUTES.SESSIONS}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          My Club
        </Link>
        <h1 className="mb-6 text-2xl font-bold text-foreground">Settings</h1>
        <HostProfileForm host={host} />
      </div>
    </div>
  );
}
