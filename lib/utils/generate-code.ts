// Generates a cryptographically random 6-character join code
// Uses only characters that are unambiguous (no O/0, I/1 confusion)
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(): string {
  const array = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for non-browser environments
    for (let i = 0; i < 6; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array)
    .map((byte) => CHARS[byte % CHARS.length])
    .join("");
}

export function generateDeviceToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
