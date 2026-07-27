import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateTodaySession } from "@/lib/session";
import { getQueueDepth } from "@/lib/queue";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cabinId = parseInt(searchParams.get("cabinId") ?? "0");

  const cabin = await prisma.cabin.findUnique({
    where: { id: cabinId },
    include: { level: true, operator: true },
  });

  if (!cabin) {
    return NextResponse.json({ error: "Cabin not found" }, { status: 404 });
  }

  const session = await getOrCreateTodaySession();

  // Find currently assigned token (CALLED or IN_PROGRESS).
  // Order deterministically so the operator always sees the most recently
  // assigned token — never an arbitrary/stale one if orphans exist.
  const currentToken = await prisma.token.findFirst({
    where: {
      sessionId: session.id,
      currentCabinId: cabinId,
      currentState: { in: ["CALLED", "IN_PROGRESS"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  const queueDepth = await getQueueDepth(cabin.level.order);

  // Stats for today
  const events = await prisma.tokenEvent.groupBy({
    by: ["toState"],
    where: {
      cabinId,
      createdAt: { gte: session.date },
    },
    _count: true,
  });

  const statMap = Object.fromEntries(events.map((e) => [e.toState, e._count]));

  return NextResponse.json({
    cabinId: cabin.id,
    cabinName: cabin.name,
    levelOrder: cabin.level.order,
    levelName: cabin.level.name,
    operatorName: cabin.operator?.name ?? "Operator",
    currentToken: currentToken
      ? {
          id: currentToken.id,
          displayNumber: currentToken.displayNumber,
          metadata: currentToken.metadata,
          createdAt: currentToken.createdAt,
          waitMinutes: Math.round((Date.now() - new Date(currentToken.createdAt).getTime()) / 60000),
          state: currentToken.currentState,
        }
      : null,
    queueDepth,
    stats: {
      processed: (statMap["APPROVED"] ?? 0) + (statMap["COMPLETED"] ?? 0),
      approved: statMap["APPROVED"] ?? 0,
      hold: statMap["HOLD"] ?? 0,
      noShow: statMap["NO_SHOW"] ?? 0,
    },
  });
}
