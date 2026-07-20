import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Thanks for Playing" };

export default function ThankYouPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">You&apos;re all set!</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask your host to show the session QR code anytime you&apos;d like to join or rejoin.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
