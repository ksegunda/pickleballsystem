import { PlayerHeader } from "@/components/player/layout/PlayerHeader";

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlayerHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
