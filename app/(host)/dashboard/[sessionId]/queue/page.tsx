import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";

interface PageProps { params: Promise<{ sessionId: string }> }

export default async function QueuePage({ params }: PageProps) {
  const { sessionId } = await params;
  redirect(ROUTES.COURTS(sessionId));
}
