"use client";

import { useState, useEffect } from "react";
import { formatTimerDisplay } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

interface TimerDisplayProps {
  startedAt:  string | null;
  running?:   boolean;
  className?: string;
  size?:      "sm" | "md" | "lg";
}

export function TimerDisplay({ startedAt, running = true, className, size = "md" }: TimerDisplayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || !running) return;

    const start = new Date(startedAt).getTime();
    const tick  = () => setElapsed(Math.floor((Date.now() - start) / 1000));

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, running]);

  if (!startedAt) return null;

  const sizeMap = {
    sm: "text-base font-mono font-semibold tabular-nums",
    md: "text-xl font-mono font-bold tabular-nums",
    lg: "text-3xl font-mono font-bold tabular-nums",
  };

  return (
    <span className={cn(sizeMap[size], className)}>
      {formatTimerDisplay(elapsed)}
    </span>
  );
}
