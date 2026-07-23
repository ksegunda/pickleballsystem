import type { Metadata } from "next";
import { PlayerBottomNav } from "@/components/player/layout/PlayerBottomNav";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { AppBrandHeader } from "@/components/shared/AppBrandHeader";

export const metadata: Metadata = { title: "My Session" };

interface PlayerLayoutProps {
  children:  React.ReactNode;
  params:    Promise<{ sessionId: string }>;
}

export default async function PlayerSessionLayout({ children, params }: PlayerLayoutProps) {
  const { sessionId } = await params;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <ConnectionBanner />
      <AppBrandHeader />
      <main className="flex-1 pb-20">
        {children}
      </main>
      <PlayerBottomNav sessionId={sessionId} />
    </div>
  );
}
