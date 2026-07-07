import crypto from "crypto";

// Signs/verifies short-lived join tokens embedded in the host's QR code.
// Stateless (HMAC-signed, no DB row) — a fresh token is minted on every
// /api/qr/[sessionId] request, so the displayed QR rotates automatically
// and a screenshot of it goes stale once the embedded `exp` passes.

interface QrTokenPayload {
  sid: string; // session id
  exp: number; // unix seconds
}

function getSecret(): string {
  const secret = process.env.QR_TOKEN_SECRET;
  if (!secret) throw new Error("QR_TOKEN_SECRET is not configured");
  return secret;
}

function sign(payloadB64: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function signQrToken(sessionId: string, ttlSeconds = 60): string {
  const secret = getSecret();
  const payload: QrTokenPayload = {
    sid: sessionId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function verifyQrToken(token: string): { sessionId: string } | null {
  // Defensive by design: any failure here — missing secret, malformed input,
  // bad signature, expired token — should read as "not a valid token" to the
  // caller, never crash the join page. Minting (signQrToken) is what surfaces
  // a misconfigured secret loudly; verification just declines.
  try {
    const secret = getSecret();
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    const expected = sign(payloadB64, secret);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload: QrTokenPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof payload.sid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { sessionId: payload.sid };
  } catch {
    return null;
  }
}
