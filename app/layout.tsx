import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets:  ["latin"],
  display:  "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default:  "PaddleSync — Pickleball Queue Management",
    template: "%s | PaddleSync",
  },
  description:
    "Intelligent, fair matchmaking for pickleball open play sessions. " +
    "Real-time queue management, smart rotation, and balanced team generation.",
  keywords:  ["pickleball", "open play", "queue management", "matchmaking"],
  authors:   [{ name: "PaddleSync" }],
  manifest:  "/manifest.json",
  // Favicon/apple-touch-icon now come from app/icon.png + app/apple-icon.png
  // (Next.js file convention — takes priority over a manual `icons` block,
  // no metadata needed here anymore).
};

export const viewport: Viewport = {
  themeColor:       [
    { media: "(prefers-color-scheme: light)", color: "#2B6FAB" },
    { media: "(prefers-color-scheme: dark)",  color: "#0E161B" },
  ],
  width:            "device-width",
  initialScale:     1,
  maximumScale:     1,  // prevent auto-zoom on input focus (mobile UX)
  userScalable:     false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              style: { borderRadius: "12px" },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
