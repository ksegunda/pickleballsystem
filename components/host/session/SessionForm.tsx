"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createSessionSchema, type CreateSessionSchema } from "@/lib/validations/session.schema";
import { createSessionAction } from "@/actions/session.actions";
import { ROUTES } from "@/lib/constants/routes";
import { formatTime } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const STEPS = ["Basic Info", "Configuration", "Settings"] as const;

const NO_END_TIME = "none";

// Every 30-minute slot in a day, e.g. "00:00", "00:30", … "23:30".
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const value = `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`;
  return { value, label: formatTime(value) };
});

function roundToNearestSlot(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${m < 30 ? "00" : "30"}`;
}

export function SessionForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const stepRef = useRef(step);
  stepRef.current = step;

  const today = new Date().toISOString().split("T")[0];
  const now   = roundToNearestSlot(new Date().toTimeString().slice(0, 5));

  const form = useForm<CreateSessionSchema>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: {
      session_date:     today,
      start_time:       now,
      number_of_courts: 2,
      settings: {
        allow_late_join: true,
        dark_mode:       false,
        match_format:    "doubles",
        games_to_win:    11,
      },
    },
  });

  const { register, handleSubmit, formState: { errors }, setValue, watch, trigger } = form;

  async function goNext() {
    if (isTransitioning) return;
    const fields: Record<number, (keyof CreateSessionSchema)[]> = {
      0: ["club_name", "session_name", "session_date", "start_time", "end_time"],
      1: ["number_of_courts"],
    };
    const valid = await trigger(fields[step] ?? []);
    if (valid) {
      setIsTransitioning(true);
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  // Enter in a text field should advance the wizard, not fall through to the
  // browser's native implicit form submission — only the last step's button
  // is ever type="submit", so this keeps Enter's behavior consistent on every
  // step instead of doing nothing on 0/1 and submitting for real on 2.
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (!(e.target instanceof HTMLInputElement)) return;
    if (step === STEPS.length - 1) return;
    e.preventDefault();
    goNext();
  }

  async function onSubmit(data: CreateSessionSchema) {
    setIsLoading(true);
    try {
      const result = await createSessionAction(data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Session created! Redirecting to dashboard…");
      router.push(ROUTES.DASHBOARD(result.data.id));
    } catch {
      toast.error("Failed to create session. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const allowLateJoin = watch("settings.allow_late_join");
  const darkMode      = watch("settings.dark_mode");

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i < step
                  ? "bg-primary text-white"
                  : i === step
                  ? "bg-primary/10 text-primary border-2 border-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-sm font-medium ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="mx-1 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} onKeyDown={handleFormKeyDown}>
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onAnimationComplete={() => { if (stepRef.current === 0) setIsTransitioning(false); }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Session Details</CardTitle>
                  <CardDescription>Basic information about your open play session</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="club_name">Club Name</Label>
                    <Input id="club_name" placeholder="Pickled Courts CC" {...register("club_name")} />
                    {errors.club_name && <p className="text-xs text-destructive">{errors.club_name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="session_name">Session Name</Label>
                    <Input id="session_name" placeholder="Friday Open Play" {...register("session_name")} />
                    {errors.session_name && <p className="text-xs text-destructive">{errors.session_name.message}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="session_date">Date</Label>
                      <Input id="session_date" type="date" min={today} {...register("session_date")} />
                      {errors.session_date && <p className="text-xs text-destructive">{errors.session_date.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="start_time">Start Time</Label>
                      <Select
                        value={watch("start_time")}
                        onValueChange={(v) => setValue("start_time", v, { shouldValidate: true })}
                      >
                        <SelectTrigger id="start_time">
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="end_time">End Time <span className="text-muted-foreground">(opt.)</span></Label>
                      <Select
                        value={watch("end_time") || NO_END_TIME}
                        onValueChange={(v) =>
                          setValue("end_time", v === NO_END_TIME ? "" : v, { shouldValidate: true })
                        }
                      >
                        <SelectTrigger id="end_time">
                          <SelectValue placeholder="No end time" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_END_TIME}>No end time</SelectItem>
                          {TIME_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.end_time && <p className="text-xs text-destructive">{errors.end_time.message}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onAnimationComplete={() => { if (stepRef.current === 1) setIsTransitioning(false); }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Court & Player Configuration</CardTitle>
                  <CardDescription>Set up courts and player limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="number_of_courts">Number of Courts</Label>
                      <Input
                        id="number_of_courts"
                        type="number"
                        min={1}
                        max={20}
                        {...register("number_of_courts", { valueAsNumber: true })}
                      />
                      {errors.number_of_courts && <p className="text-xs text-destructive">{errors.number_of_courts.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="max_players">Max Players <span className="text-muted-foreground">(opt.)</span></Label>
                      <Input
                        id="max_players"
                        type="number"
                        min={4}
                        placeholder="Unlimited"
                        {...register("max_players", { valueAsNumber: true, setValueAs: (v) => v === "" ? null : Number(v) })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Match Format</Label>
                    <Select
                      defaultValue="doubles"
                      onValueChange={(v) => setValue("settings.match_format", v as "doubles" | "singles")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="doubles">Doubles (2v2)</SelectItem>
                        <SelectItem value="singles">Singles (1v1)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Points to Win</Label>
                    <Select
                      defaultValue="11"
                      onValueChange={(v) => setValue("settings.games_to_win", Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="11">11 points</SelectItem>
                        <SelectItem value="15">15 points</SelectItem>
                        <SelectItem value="21">21 points</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onAnimationComplete={() => { if (stepRef.current === 2) setIsTransitioning(false); }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Session Settings</CardTitle>
                  <CardDescription>Queue rules and preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Allow Late Join</p>
                      <p className="text-xs text-muted-foreground">Players can join after the session starts</p>
                    </div>
                    <Switch
                      checked={allowLateJoin}
                      onCheckedChange={(v) => setValue("settings.allow_late_join", v)}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Dark Mode</p>
                      <p className="text-xs text-muted-foreground">Default theme for player screens</p>
                    </div>
                    <Switch
                      checked={darkMode}
                      onCheckedChange={(v) => setValue("settings.dark_mode", v)}
                    />
                  </div>

                  <Separator />

                  <div className="rounded-xl bg-muted/50 p-4 space-y-3">
                    <p className="text-sm font-semibold">Fairness Algorithm Weights</p>
                    <p className="text-xs text-muted-foreground">
                      Controls how the matchmaking algorithm prioritizes players. Weights must sum to 1.0.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Wait Time",    field: "settings.weight_waiting_time" as const, default: "0.40" },
                        { label: "Games Played", field: "settings.weight_games_played" as const, default: "0.35" },
                        { label: "Performance",  field: "settings.weight_performance"  as const, default: "0.25" },
                      ].map((w) => (
                        <div key={w.field} className="space-y-1">
                          <Label className="text-xs">{w.label}</Label>
                          <Input
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            defaultValue={w.default}
                            className="h-9 text-sm"
                            {...register(w.field, { valueAsNumber: true })}
                          />
                        </div>
                      ))}
                    </div>
                    {errors.settings?.weight_performance && (
                      <p className="text-xs text-destructive">
                        {errors.settings.weight_performance.message}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          )}

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext} disabled={isTransitioning}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" loading={isLoading}>
              <Check className="h-4 w-4" />
              Create Session
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
