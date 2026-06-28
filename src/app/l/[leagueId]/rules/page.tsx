import { Rules } from "@/components/Rules";

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <Rules leagueId={leagueId} />;
}
