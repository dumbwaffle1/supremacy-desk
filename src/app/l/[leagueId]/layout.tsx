import { LeagueGate } from "@/components/LeagueGate";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <LeagueGate leagueId={leagueId}>{children}</LeagueGate>;
}
