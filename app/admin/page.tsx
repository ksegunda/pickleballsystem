import type { Metadata } from "next";
import { getAllHostsAction } from "@/actions/admin.actions";
import { AdminHostRow } from "@/components/admin/AdminHostRow";
import { EmptyState } from "@/components/shared/EmptyState";
import { Users } from "lucide-react";

export const metadata: Metadata = { title: "Super Admin" };

export default async function AdminPage() {
  const result = await getAllHostsAction();
  const hosts = result.success ? result.data : [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">All Hosts</h2>
        <p className="text-sm text-muted-foreground">{hosts.length} registered host{hosts.length === 1 ? "" : "s"}</p>
      </div>

      {hosts.length === 0 ? (
        <EmptyState icon={Users} title="No hosts yet" description="Registered hosts will show up here." />
      ) : (
        <div className="space-y-3">
          {hosts.map((host) => (
            <AdminHostRow key={host.id} host={host} />
          ))}
        </div>
      )}
    </div>
  );
}
