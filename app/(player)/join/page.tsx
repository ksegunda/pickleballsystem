import type { Metadata } from "next";
import { EnterCodeForm } from "@/components/player/join/EnterCodeForm";

export const metadata: Metadata = { title: "Join Session" };

export default function JoinPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <EnterCodeForm />
    </div>
  );
}
