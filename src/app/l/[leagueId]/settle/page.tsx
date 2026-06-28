import { Settle } from "@/components/Settle";

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <Settle leagueId={leagueId} />;
}
