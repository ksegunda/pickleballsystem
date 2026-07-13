import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { logoutAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account Suspended" };

export default function SuspendedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-8 w-8 text-destructive" />
      </div>
      <h1 className="mt-4 text-xl font-bold text-foreground">Your account is suspended</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Access to your sessions has been temporarily disabled. Your data hasn&apos;t been deleted —
        contact the platform owner to have this resolved.
      </p>
      <form action={logoutAction} className="mt-6">
        <Button type="submit" variant="outline">Sign Out</Button>
      </form>
    </div>
  );
}
