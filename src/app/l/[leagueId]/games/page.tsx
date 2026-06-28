import { GamesList } from "@/components/GamesList";

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <GamesList leagueId={leagueId} />;
}
