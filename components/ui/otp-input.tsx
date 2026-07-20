"use client";

import { useEffect, useRef } from "react";

interface OtpInputProps {
  length?:     number;
  value:       string;
  onChange:    (value: string) => void;
  disabled?:   boolean;
  autoFocus?:  boolean;
}

// Plain, dependency-free segmented digit input — auto-advances on entry,
// steps back on backspace into an empty box, and fills all boxes at once
// from a single pasted code.
export function OtpInput({ length = 6, value, onChange, disabled = false, autoFocus = false }: OtpInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) inputRefs.current[0]?.focus();
  }, [autoFocus]);

  function setDigitAt(index: number, digit: string) {
    const chars = value.split("");
    chars[index] = digit;
    onChange(chars.join("").slice(0, length));
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigitAt(index, digit);
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[i] ?? ""}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-12 w-10 rounded-xl border border-input bg-background text-center text-lg font-bold text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-14 sm:w-12"
        />
      ))}
    </div>
  );
}
