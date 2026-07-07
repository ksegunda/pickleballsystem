"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Zap, LayoutDashboard, Users, Activity, Trophy,
  ChevronRight, LogOut, Menu, X
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/lib/constants/routes";
import { logoutAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Database } from "@/types/database.types";

type Host = Database["public"]["Tables"]["hosts"]["Row"];

interface SidebarItem {
  label: string;
  href:  string;
  icon:  React.ComponentType<{ className?: string }>;
}

interface SidebarProps {
  sessionId: string;
  host:      Host | null;
  sessionName: string;
}

function useSidebarItems(sessionId: string): SidebarItem[] {
  return [
    { label: "Overview",    href: ROUTES.DASHBOARD(sessionId),    icon: LayoutDashboard },
    { label: "Courts",      href: ROUTES.COURTS(sessionId),       icon: Activity },
    { label: "Players",     href: ROUTES.PLAYERS(sessionId),      icon: Users },
    { label: "Leaderboard", href: ROUTES.LEADERBOARD(sessionId),  icon: Trophy },
  ];
}

export function Sidebar({ sessionId, host, sessionName }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = useSidebarItems(sessionId);

  const hostInitials = host?.name
    ? host.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "H";

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shrink-0">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">OpenPlay</p>
          <p className="text-xs text-muted-foreground truncate">{sessionName}</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {items.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== ROUTES.DASHBOARD(sessionId) && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn("nav-item", isActive && "nav-item-active")}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" />}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* All Sessions link */}
      <div className="p-3">
        <Link href={ROUTES.SESSIONS} className="nav-item">
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span>All Sessions</span>
        </Link>
      </div>

      {/* Host profile + logout */}
      <div className="border-t border-border p-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
          {hostInitials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{host?.name ?? "Host"}</p>
          <p className="text-xs text-muted-foreground truncate">{host?.club_name ?? "Club Host"}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[var(--sidebar-width)] lg:fixed lg:inset-y-0 lg:left-0 border-r border-border bg-card">
        <SidebarContent />
      </aside>

      {/* Mobile: hamburger button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileOpen((v) => !v)}
          className="shadow-card-md"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Mobile: overlay + drawer */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border"
          >
            <SidebarContent />
          </motion.aside>
        </>
      )}
    </>
  );
}
