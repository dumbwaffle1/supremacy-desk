import { GameDetail } from "@/components/GameDetail";

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string; gameId: string }>;
}) {
  const { leagueId, gameId } = await params;
  return <GameDetail gameId={gameId} leagueId={leagueId} />;
}
