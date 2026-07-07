import { cn } from "@/lib/utils/cn";

interface LiveIndicatorProps {
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

export function LiveIndicator({ label = "LIVE", className, size = "md" }: LiveIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex">
        <span
          className={cn(
            "absolute inline-flex rounded-full bg-green-500 opacity-75 animate-ping",
            size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"
          )}
        />
        <span
          className={cn(
            "relative inline-flex rounded-full bg-green-500",
            size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"
          )}
        />
      </span>
      {label && (
        <span
          className={cn(
            "font-semibold text-green-600 dark:text-green-400 tracking-wider",
            size === "sm" ? "text-[10px]" : "text-xs"
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
