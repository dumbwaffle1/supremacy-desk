import { JoinByCode } from "@/components/JoinByCode";

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <JoinByCode code={code} />;
}
