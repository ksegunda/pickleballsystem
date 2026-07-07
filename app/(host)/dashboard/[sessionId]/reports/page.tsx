import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>
      <p className="text-muted-foreground">Session reports with PDF and Excel export. Phase 4.</p>
    </div>
  );
}
