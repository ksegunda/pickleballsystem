import { AppBrandHeader } from "@/components/shared/AppBrandHeader";

// Header for the pre-session player pages (join/thank-you) — reuses the
// exact same AppBrandHeader shown on every bottom-nav screen (Play/Courts/
// Stats/Leaderboard) rather than a separate logo treatment, so branding is
// consistent everywhere a player can land, not just once they're in a
// session.
export function PlayerHeader() {
  return (
    <header className="shrink-0 border-b border-border bg-card">
      <AppBrandHeader className="pb-4" />
    </header>
  );
}
