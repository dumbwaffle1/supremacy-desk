import { AdminOnly } from "@/components/AdminOnly";
import { FixturesAdminPanel } from "@/components/FixturesAdminPanel";
import { MakerDrawPanel } from "@/components/admin/MakerDrawPanel";
import { RosterAdminPanel } from "@/components/admin/RosterAdminPanel";
import { StakesAdminPanel } from "@/components/admin/StakesAdminPanel";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { DevSeedPanel } from "@/components/DevSeedPanel";

export default function AdminPage() {
  return (
    <AdminOnly>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Settle / override / void live on each game&apos;s page.
          </p>
        </div>
        <FixturesAdminPanel />
        <MakerDrawPanel />
        <RosterAdminPanel />
        <StakesAdminPanel />
        <AuditLogPanel />
        {process.env.NODE_ENV !== "production" && <DevSeedPanel />}
      </div>
    </AdminOnly>
  );
}
