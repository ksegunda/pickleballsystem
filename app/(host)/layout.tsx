import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/supabase/auth";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const user = await getVerifiedUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
