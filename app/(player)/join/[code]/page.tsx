import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { JoinForm } from "@/components/player/join/JoinForm";
import { PlayerHeader } from "@/components/player/layout/PlayerHeader";

export const metadata: Metadata = { title: "Join Session" };

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinWithCodePage({ params }: PageProps) {
  const { code } = await params;
  const supabase = await createClient();
  const service  = new SessionService(supabase);

  const session = await service.getSessionByJoinCode(code).catch(() => null);
  if (!session) notFound();

  const settings = await service.getSettings(session.id).catch(() => null);

  return (
    <>
      <PlayerHeader />
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <JoinForm session={session} playerLevel={settings?.player_level ?? null} />
      </div>
    </>
  );
}
