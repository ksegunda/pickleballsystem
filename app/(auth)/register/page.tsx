import type { Metadata } from "next";
import { RegisterForm } from "@/components/host/layout/RegisterForm";

export const metadata: Metadata = { title: "Create Host Account" };

export default function RegisterPage() {
  return <RegisterForm />;
}
