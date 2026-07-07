export const ROUTES = {
  // Public
  HOME:       "/",
  LOGIN:      "/login",
  REGISTER:   "/register",

  // Host
  SESSIONS:   "/sessions",
  NEW_SESSION: "/sessions/new",
  DASHBOARD:  (sessionId: string) => `/dashboard/${sessionId}`,
  COURTS:     (sessionId: string) => `/dashboard/${sessionId}/courts`,
  MATCHES:    (sessionId: string) => `/dashboard/${sessionId}/matches`,
  PLAYERS:    (sessionId: string) => `/dashboard/${sessionId}/players`,
  STATS:      (sessionId: string) => `/dashboard/${sessionId}/stats`,
  LEADERBOARD:(sessionId: string) => `/dashboard/${sessionId}/leaderboard`,
  REPORTS:    (sessionId: string) => `/dashboard/${sessionId}/reports`,

  // Player
  JOIN:        "/join",
  JOIN_CODE:   (code: string) => `/join/${code}`,
  JOIN_TOKEN:  (token: string) => `/join/t/${token}`,
  PLAY:        (sessionId: string) => `/play/${sessionId}`,
  PLAY_HISTORY:(sessionId: string) => `/play/${sessionId}/history`,
  PLAY_STATS:  (sessionId: string) => `/play/${sessionId}/stats`,
  PLAY_LEADERBOARD: (sessionId: string) => `/play/${sessionId}/leaderboard`,

  // API
  QR_CODE:    (sessionId: string) => `/api/qr/${sessionId}`,
  EXPORT_PDF: (sessionId: string) => `/api/export/${sessionId}/pdf`,
  EXPORT_EXCEL:(sessionId: string) => `/api/export/${sessionId}/excel`,
} as const;
