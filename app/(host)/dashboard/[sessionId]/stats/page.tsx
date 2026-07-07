import type { Metadata } from "next";

export const metadata: Metadata = { title: "Statistics" };

export default async function StatsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Statistics</h1>
      <p className="text-muted-foreground">Fairness score, wait time analytics, court utilization. Phase 4.</p>
    </div>
  );
}
