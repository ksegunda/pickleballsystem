"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Zap, ArrowRight } from "lucide-react";
import { enterJoinCodeSchema, type EnterJoinCodeSchema } from "@/lib/validations/player.schema";
import { getSessionByCodeAction } from "@/actions/session.actions";
import { normalizeJoinCode } from "@/lib/utils/generate-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants/routes";

export function EnterCodeForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<EnterJoinCodeSchema>({
    resolver: zodResolver(enterJoinCodeSchema),
  });

  async function onSubmit(data: EnterJoinCodeSchema) {
    setIsLoading(true);
    try {
      const result = await getSessionByCodeAction(data.join_code);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.push(ROUTES.JOIN_CODE(data.join_code));
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <motion.div
      className="w-full max-w-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2.5 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
            <Zap className="h-6 w-6 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">OpenPlay</h1>
        <p className="mt-1 text-muted-foreground">Join an open play session</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Enter Join Code</CardTitle>
          <CardDescription>
            Your host will share a 6-character code with you.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="join_code">Join Code</Label>
              <Input
                id="join_code"
                placeholder="ABC123"
                maxLength={6}
                className="text-center text-2xl font-bold font-mono tracking-[0.5em] uppercase h-14"
                autoFocus
                autoCapitalize="characters"
                autoCorrect="off"
                {...register("join_code", {
                  onChange: (e) => {
                    const normalized = normalizeJoinCode(e.target.value);
                    setValue("join_code", normalized);
                    e.target.value = normalized;
                  },
                })}
              />
              {errors.join_code && (
                <p className="text-center text-sm text-destructive">{errors.join_code.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg" loading={isLoading}>
              Find Session
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </form>
      </Card>
    </motion.div>
  );
}
