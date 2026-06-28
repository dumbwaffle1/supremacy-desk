import { Settings } from "@/components/Settings";

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <Settings leagueId={leagueId} />;
}
