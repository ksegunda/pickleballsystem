import type { Metadata } from "next";
import { LoginForm } from "@/components/host/layout/LoginForm";

export const metadata: Metadata = { title: "Host Login" };

export default function LoginPage() {
  return <LoginForm />;
}
