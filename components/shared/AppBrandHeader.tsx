import { cn } from "@/lib/utils/cn";

// Small consistent app-brand row shown once at the top of every bottom-nav
// screen (Play/Courts/Stats/Leaderboard), mounted once in
// play/[sessionId]/layout.tsx — and reused as-is by PlayerHeader for the
// pre-session pages (join/thank-you), so there's exactly one place that
// defines what "PaddleSync" branding looks like everywhere.
export function AppBrandHeader({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 px-5 pt-4", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="" className="h-6 w-6 rounded-md" />
      <span className="text-sm font-extrabold tracking-tight text-foreground">PaddleSync</span>
    </div>
  );
}
