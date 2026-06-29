import { Todo } from "@/components/Todo";

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <Todo leagueId={leagueId} />;
}
