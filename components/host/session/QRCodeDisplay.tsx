"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/constants/routes";

interface QRCodeDisplayProps {
  sessionId: string;
  joinCode:  string;
}

// Matches the token TTL baked into /api/qr/[sessionId] — refresh a little
// before expiry so the displayed image is never stale by the time it's scanned.
const REFRESH_INTERVAL_MS = 45_000;

export function QRCodeDisplay({ sessionId, joinCode }: QRCodeDisplayProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function refresh() {
      setQrUrl(`${ROUTES.QR_CODE(sessionId)}?t=${Date.now()}`);
      setLoading(false);
    }
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sessionId]);

  async function download() {
    if (!qrUrl) return;
    const res = await fetch(qrUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openplay-${joinCode}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">QR Code</CardTitle>
          <Button variant="ghost" size="sm" onClick={download} disabled={loading}>
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {loading ? (
          <Skeleton className="h-40 w-40 rounded-xl" />
        ) : qrUrl ? (
          <div className="rounded-2xl border border-border p-3 bg-white">
            <Image
              src={qrUrl}
              alt={`QR code for join code ${joinCode}`}
              width={160}
              height={160}
              className="rounded-lg"
              unoptimized
            />
          </div>
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-muted">
            <QrCode className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center">
          Players scan this to join instantly — no typing required.
        </p>
      </CardContent>
    </Card>
  );
}
