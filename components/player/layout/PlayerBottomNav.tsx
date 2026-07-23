"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart2, MapPin, Trophy } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/lib/constants/routes";

interface PlayerBottomNavProps {
  sessionId: string;
}

export function PlayerBottomNav({ sessionId }: PlayerBottomNavProps) {
  const pathname = usePathname();

  const items = [
    { label: "Play",        href: ROUTES.PLAY(sessionId),            icon: Activity },
    { label: "Courts",      href: ROUTES.PLAY_COURTS(sessionId),     icon: MapPin },
    { label: "Stats",       href: ROUTES.PLAY_STATS(sessionId),      icon: BarChart2 },
    { label: "Leaderboard", href: ROUTES.PLAY_LEADERBOARD(sessionId),icon: Trophy },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md pb-safe">
      <div className="flex">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon
                className={cn("h-5 w-5 transition-transform", isActive && "scale-110")}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
