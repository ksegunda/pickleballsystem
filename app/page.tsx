import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { QrCode, Users, Activity, Trophy, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Fair, Real-Time Pickleball Matchmaking" };

const FEATURES = [
  {
    icon: Users,
    title: "Fair queue, every time",
    body: "Wait time, games played, and win-rate balance decide who's up next — never just who shouted loudest.",
  },
  {
    icon: Activity,
    title: "Live courts, no guessing",
    body: "Every court's status updates in real time for hosts and players alike — who's playing, who's next, how long they've been out there.",
  },
  {
    icon: Trophy,
    title: "Stats that stick around",
    body: "Win rate, streaks, and full match history for every player, all session long.",
  },
];

export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/sessions");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo.png" alt="PaddleSync" className="h-14 w-auto sm:h-16" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-5xl text-balance">
            PaddleSync
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground text-balance">
            Fair, real-time matchmaking for pickleball open play — hosts run the session,
            players just show up and scan in.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/login">
                Host Login
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/register">Create an Account</Link>
            </Button>
          </div>
        </div>

        {/* Player note */}
        <Card className="mx-auto mt-14 max-w-2xl border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center sm:flex-row sm:text-left">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <QrCode className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Playing today? </span>
              Scan the QR code your host has on display at the courts — no account or app
              download needed, you're in the queue in seconds.
            </p>
          </CardContent>
        </Card>

        {/* Feature highlights */}
        <div className="mt-16 grid gap-5 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardContent className="p-6 space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10">
                  <f.icon className="h-5 w-5 text-secondary" />
                </div>
                <h2 className="font-semibold text-foreground">{f.title}</h2>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
