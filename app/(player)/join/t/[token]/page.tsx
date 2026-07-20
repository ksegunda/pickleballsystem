import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { JoinForm } from "@/components/player/join/JoinForm";
import { verifyQrToken } from "@/lib/utils/qr-token";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "Join Session" };

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function JoinWithQrTokenPage({ params }: PageProps) {
  const { token } = await params;
  const verified = verifyQrToken(token);

  if (!verified) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>QR code expired</CardTitle>
            <CardDescription>
              This QR code refreshes automatically every minute for security.
              Ask your host to show it again and rescan.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const service  = new SessionService(supabase);
  const session  = await service.getSession(verified.sessionId).catch(() => null);

  if (!session || !["pending", "active"].includes(session.status)) notFound();

  const settings = await service.getSettings(session.id).catch(() => null);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <JoinForm session={session} playerLevel={settings?.player_level ?? null} />
    </div>
  );
}
