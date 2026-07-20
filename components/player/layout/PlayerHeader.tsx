// Plain <img>, not next/image — the real logo file's dimensions aren't
// known ahead of time, so this scales by height alone (h-* + w-auto)
// rather than requiring an intrinsic width/height up front.
export function PlayerHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-center border-b border-border bg-card px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/branding/logo.png" alt="Logo" className="h-8 w-auto sm:h-9" />
    </header>
  );
}
