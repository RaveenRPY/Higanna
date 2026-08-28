import { GameRoom } from "@/components/GameRoom";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ join?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  return <GameRoom codeParam={code} inviteJoin={query.join === "1"} />;
}
