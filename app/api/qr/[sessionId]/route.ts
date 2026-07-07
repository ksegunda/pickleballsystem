import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/constants/routes";
import { signQrToken } from "@/lib/utils/qr-token";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

const QR_TOKEN_TTL_SECONDS = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { sessionId } = await params;

  try {
    const supabase = await createClient();
    const { data: session, error } = await supabase
      .from("sessions")
      .select("status")
      .eq("id", sessionId)
      .single();

    if (error || !session || !["pending", "active"].includes(session.status)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const token   = signQrToken(sessionId, QR_TOKEN_TTL_SECONDS);
    const joinUrl = `${appUrl}${ROUTES.JOIN_TOKEN(token)}`;

    const qrBuffer: Buffer = await QRCode.toBuffer(joinUrl, {
      type:          "png",
      width:         400,
      margin:        2,
      color: {
        dark:  "#0F172A",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "M",
    });

    // Copy into a plain ArrayBuffer-backed Uint8Array for NextResponse/BodyInit compatibility
    const uint8 = new Uint8Array(qrBuffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type":   "image/png",
        // The embedded token rotates every request — never cache this image.
        "Cache-Control":  "no-store",
        "Content-Length": qrBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("[QR API]", err);
    return NextResponse.json({ error: "Failed to generate QR code" }, { status: 500 });
  }
}
