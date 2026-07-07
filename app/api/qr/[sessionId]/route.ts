import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/constants/routes";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { sessionId } = await params;

  try {
    const supabase = await createClient();
    const { data: session, error } = await supabase
      .from("sessions")
      .select("join_code")
      .eq("id", sessionId)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const joinUrl = `${appUrl}${ROUTES.JOIN_CODE(session.join_code)}`;

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
        "Cache-Control":  "public, max-age=3600, immutable",
        "Content-Length": qrBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("[QR API]", err);
    return NextResponse.json({ error: "Failed to generate QR code" }, { status: 500 });
  }
}
