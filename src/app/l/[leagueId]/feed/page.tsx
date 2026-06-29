import { Feed } from "@/components/Feed";

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <Feed leagueId={leagueId} />;
}
