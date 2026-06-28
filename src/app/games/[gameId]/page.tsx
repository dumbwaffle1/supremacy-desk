import { GameDetail } from "@/components/GameDetail";

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  return <GameDetail gameId={gameId} />;
}
