import type { Metadata } from "next";
import { SessionForm } from "@/components/host/session/SessionForm";

export const metadata: Metadata = { title: "New Session" };

export default function NewSessionPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Create Session</h1>
          <p className="mt-1 text-muted-foreground">
            Configure your open play session. Players will join via QR code or join code.
          </p>
        </div>
        <SessionForm />
      </div>
    </div>
  );
}
