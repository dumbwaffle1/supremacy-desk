import { Desk } from "@/components/Desk";

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <Desk leagueId={leagueId} />;
}
