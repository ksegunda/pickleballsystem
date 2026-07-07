"use client";

import { useEffect, useState } from "react";

export function useElapsedSeconds(since: string | null | undefined, active = true): number {
  // Starts at 0 (not the real elapsed time) so SSR markup and the client's
  // first render match exactly — Date.now() differs between when the server
  // rendered and when the client hydrates, which caused a hydration mismatch.
  // The real value is computed client-side only, inside the effect below.
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!since || !active) {
      setElapsed(0);
      return;
    }

    const start = new Date(since).getTime();
    const tick  = () => setElapsed(Math.floor((Date.now() - start) / 1000));

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [since, active]);

  return elapsed;
}
