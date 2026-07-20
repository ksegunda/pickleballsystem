"use server";

import { revalidatePath } from "next/cache";
import { redirect }        from "next/navigation";
import { createClient }    from "@/lib/supabase/server";
import { createSessionSchema } from "@/lib/validations/session.schema";
import { SessionService }  from "@/services/session.service";
import { ReportService }   from "@/services/report.service";
import type { CreateSessionSchema } from "@/lib/validations/session.schema";
import type { ActionResult } from "./auth.actions";
import type { Session } from "@/types/session.types";

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

export async function createSessionAction(
  formData: CreateSessionSchema
): Promise<ActionResult<Session>> {
  const parsed = createSessionSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const service = new SessionService(supabase);
    const session = await service.createSession(userId, parsed.data);
    revalidatePath("/sessions");
    return { success: true, data: session };
  } catch (err) {
    console.error("[createSessionAction]", err);
    const msg = err instanceof Error ? err.message : "Failed to create session.";
    return { success: false, error: msg };
  }
}

export async function startSessionAction(
  sessionId: string
): Promise<ActionResult<Session>> {
  try {
    const { supabase } = await getAuthenticatedClient();
    const service = new SessionService(supabase);
    const session = await service.startSession(sessionId);
    revalidatePath(`/dashboard/${sessionId}`);
    return { success: true, data: session };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start session.";
    return { success: false, error: msg };
  }
}

export async function endSessionAction(
  sessionId: string
): Promise<ActionResult<{ pdfBase64: string; fileName: string }>> {
  try {
    const { supabase } = await getAuthenticatedClient();
    const service = new ReportService(supabase);
    const { pdfBytes, reportData } = await service.endSessionWithReport(sessionId);

    revalidatePath("/sessions");
    revalidatePath(`/dashboard/${sessionId}`);

    return {
      success: true,
      data: {
        pdfBase64: Buffer.from(pdfBytes).toString("base64"),
        fileName:  `${reportData.sessionName.replace(/[^a-z0-9]+/gi, "-")}-report.pdf`,
      },
    };
  } catch (err) {
    console.error(`[endSessionAction] session=${sessionId}`, err);
    const msg = err instanceof Error ? err.message : "Failed to end session.";
    return { success: false, error: msg };
  }
}

export async function getHostSessionsAction() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const service = new SessionService(supabase);
    return await service.getHostSessions(userId);
  } catch {
    return [];
  }
}

export async function getSessionSummaryAction(sessionId: string) {
  const supabase = await createClient();
  const service  = new SessionService(supabase);
  return service.getSessionSummary(sessionId).catch(() => null);
}
