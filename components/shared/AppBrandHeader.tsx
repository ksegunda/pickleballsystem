// Small consistent app-brand row shown once at the top of every bottom-nav
// screen (Play/Courts/Stats/Leaderboard) — distinct from PlayerHeader,
// which is the bigger pre-join/thank-you logo shown before a player has
// an active session to navigate. Mounted once in play/[sessionId]/layout.tsx
// so every tab gets it from one place instead of each view duplicating it.
export function AppBrandHeader() {
  return (
    <div className="flex items-center gap-2 px-5 pt-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="" className="h-6 w-6 rounded-md" />
      <span className="text-sm font-extrabold tracking-tight text-foreground">PaddleSync</span>
    </div>
  );
}
