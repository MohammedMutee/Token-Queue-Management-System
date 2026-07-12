import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateTodaySession } from "@/lib/session";

export async function GET() {
  const session = await getOrCreateTodaySession();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [
    tokensByState,
    cabins,
    throughput,
    processedPerCabin,
  ] = await Promise.all([
    prisma.token.groupBy({
      by: ["currentState"],
      where: { sessionId: session.id },
      _count: true,
    }),
    prisma.cabin.findMany({
      include: {
        level: true,
        operator: { select: { id: true, name: true } },
        events: {
          where: {
            toState: { in: ["CALLED", "IN_PROGRESS"] },
            token: { sessionId: session.id, currentState: { in: ["CALLED", "IN_PROGRESS"] } },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { token: { select: { displayNumber: true, currentState: true } } },
        },
      },
      orderBy: [{ levelId: "asc" }, { name: "asc" }],
    }),
    prisma.tokenEvent.count({
      where: {
        toState: "COMPLETED",
        createdAt: { gte: oneHourAgo },
        token: { sessionId: session.id },
      },
    }),
    prisma.tokenEvent.groupBy({
      by: ["cabinId"],
      where: {
        toState: { in: ["APPROVED", "COMPLETED"] },
        cabinId: { not: null },
        token: { sessionId: session.id },
      },
      _count: true,
    }),
  ]);

  const stateCounts: Record<string, number> = {};
  for (const group of tokensByState) {
    stateCounts[group.currentState] = group._count;
  }

  const processedMap: Record<number, number> = {};
  for (const group of processedPerCabin) {
    if (group.cabinId) processedMap[group.cabinId] = group._count;
  }

  const cabinStatuses = cabins.map((c) => {
    const activeEvent = c.events[0];
    const hasToken = !!activeEvent?.token;
    return {
      id: c.id,
      name: c.name,
      level: c.level.name,
      operator: c.operator?.name ?? null,
      isActive: c.isActive,
      currentToken: hasToken ? activeEvent.token.displayNumber : null,
      processedToday: processedMap[c.id] ?? 0,
    };
  });

  const issued = Object.values(stateCounts).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    summary: {
      issued,
      waiting: stateCounts["WAITING"] ?? 0,
      inProgress: (stateCounts["CALLED"] ?? 0) + (stateCounts["IN_PROGRESS"] ?? 0),
      completed: stateCounts["COMPLETED"] ?? 0,
      hold: stateCounts["HOLD"] ?? 0,
      noShow: stateCounts["NO_SHOW"] ?? 0,
    },
    cabins: cabinStatuses,
    throughput,
  });
}
