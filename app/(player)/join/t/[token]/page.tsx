import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { JoinForm } from "@/components/player/join/JoinForm";
import { verifyQrToken } from "@/lib/utils/qr-token";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Join Session" };

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function JoinWithQrTokenPage({ params }: PageProps) {
  const { token } = await params;
  const verified = verifyQrToken(token);

  if (!verified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>QR code expired</CardTitle>
            <CardDescription>
              This QR code refreshes automatically every minute for security.
              Ask your host to show it again, or use the join code instead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={ROUTES.JOIN}>
                <RefreshCw className="h-4 w-4" />
                Enter join code instead
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const service  = new SessionService(supabase);
  const session  = await service.getSession(verified.sessionId).catch(() => null);

  if (!session || !["pending", "active"].includes(session.status)) notFound();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <JoinForm session={session} />
    </div>
  );
}
