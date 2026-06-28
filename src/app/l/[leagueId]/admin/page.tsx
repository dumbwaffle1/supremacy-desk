import { AdminOnly } from "@/components/AdminOnly";
import { InvitePanel } from "@/components/admin/InvitePanel";
import { FixturesAdminPanel } from "@/components/FixturesAdminPanel";
import { MakerDrawPanel } from "@/components/admin/MakerDrawPanel";
import { RosterAdminPanel } from "@/components/admin/RosterAdminPanel";
import { StakesAdminPanel } from "@/components/admin/StakesAdminPanel";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return (
    <AdminOnly leagueId={leagueId}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Settle / override / void live on each game&apos;s page.
          </p>
        </div>
        <InvitePanel leagueId={leagueId} />
        <FixturesAdminPanel leagueId={leagueId} />
        <MakerDrawPanel leagueId={leagueId} />
        <RosterAdminPanel leagueId={leagueId} />
        <StakesAdminPanel leagueId={leagueId} />
        <AuditLogPanel leagueId={leagueId} />
      </div>
    </AdminOnly>
  );
}
