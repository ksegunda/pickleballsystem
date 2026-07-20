import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Scale, Activity, QrCode, Trophy, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { HeroIllustration } from "@/components/landing/HeroIllustration";
import { AuthCtaButton } from "@/components/landing/AuthCtaButton";

export const metadata: Metadata = { title: "Fair, Real-Time Pickleball Matchmaking" };

// Badge/text pairs are literal palette hexes (not the app-wide accessible
// --primary/--secondary/--accent tokens) — these are small self-contained
// pills with their own dark text, not standalone colored text on a light
// page, so the deepened-for-contrast tokens used everywhere else in the
// app aren't needed here. Buttons below still use --primary.
const FEATURES = [
  {
    icon: Scale,
    title: "Fair Matchmaking",
    body: "Wait time, games played, and win-rate balance decide who's up next — automatic, balanced pairing every round.",
    badgeBg: "#F9E8A2",
    badgeFg: "#4A3A12",
  },
  {
    icon: Activity,
    title: "Realtime Queue",
    body: "Every court and every position updates live — no clipboards, no shouting across the courts to check who's next.",
    badgeBg: "#B4E1EB",
    badgeFg: "#113140",
  },
  {
    icon: QrCode,
    title: "QR Check-In",
    body: "Players scan a code your host displays and they're in the queue in seconds — no accounts, no app download.",
    badgeBg: "#95BDD7",
    badgeFg: "#132B3E",
  },
  {
    icon: Trophy,
    title: "Match History & Stats",
    body: "Win rate, streaks, and full match history for every player — the whole session, all in one place.",
    badgeBg: "#78A4CB",
    badgeFg: "#0F202E",
  },
];

export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/sessions");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/logonotext.png" alt="" className="h-8 w-8 object-contain" />
            <span className="text-lg font-bold text-foreground">PaddleSync</span>
          </div>
          <nav className="hidden items-center gap-8 sm:flex">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Features
            </a>
          </nav>
          <AuthCtaButton mode="login">Host Login</AuthCtaButton>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground text-balance sm:text-5xl">
              Fair matches. Real-time courts. Zero hassle.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground text-balance">
              PaddleSync runs your pickleball open play for you — balanced matchmaking,
              live court tracking, and instant QR check-in, so you can focus on the game.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <AuthCtaButton mode="login" size="lg">
                Host Login
                <ArrowRight className="h-4 w-4" />
              </AuthCtaButton>
              <AuthCtaButton mode="register" size="lg" variant="outline">
                Create an Account
              </AuthCtaButton>
            </div>
          </div>
          <HeroIllustration />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16 sm:py-24 scroll-mt-16">
        <div className="max-w-xl">
          <span className="inline-block rounded-full bg-secondary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-secondary">
            Features
          </span>
          <h2 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl text-balance">
            Everything a host needs to run open play, built in.
          </h2>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl bg-[#0E1820] p-6">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                style={{ backgroundColor: f.badgeBg, color: f.badgeFg }}
              >
                <f.icon className="h-3.5 w-3.5" />
                {f.title}
              </span>
              <p className="mt-4 text-sm leading-relaxed text-white/70">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-muted via-background to-muted px-8 py-14 text-center sm:py-16">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl text-balance">
            Ready to run your next Open Play?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Set up courts, share a QR code, and let PaddleSync handle the queue.
          </p>
          <AuthCtaButton mode="login" size="lg" className="mt-7">
            Host Login
            <ArrowRight className="h-4 w-4" />
          </AuthCtaButton>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/logonotext.png" alt="" className="h-5 w-5 object-contain" />
            <span className="font-semibold text-foreground">PaddleSync</span>
          </div>
          <p>Fair, real-time pickleball matchmaking.</p>
        </div>
      </footer>
    </div>
  );
}
