import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateTodaySession } from "@/lib/session";

export async function GET() {
  const session = await getOrCreateTodaySession();

  const levels = await prisma.level.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });

  const levelQueues = await Promise.all(
    levels.map(async (level) => {
      const serving = await prisma.token.findMany({
        where: {
          sessionId: session.id,
          currentLevel: level.order,
          currentState: { in: ["CALLED", "IN_PROGRESS"] },
          currentCabinId: { not: null },
        },
        include: {
          events: {
            where: { toState: { in: ["CALLED", "IN_PROGRESS"] }, level: level.order },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { cabin: true },
          },
        },
        orderBy: { tokenNumber: "asc" },
      });

      const waiting = await prisma.token.findMany({
        where: {
          sessionId: session.id,
          currentLevel: level.order,
          currentState: "WAITING",
        },
        orderBy: { tokenNumber: "asc" },
        take: 20,
      });

      return {
        levelId: level.id,
        levelName: level.name,
        levelLabel: `LEVEL ${level.order}`,
        servingCount: serving.length,
        serving: serving.map((t) => {
          const cabin = t.events[0]?.cabin;
          return {
            id: t.id,
            displayNumber: t.displayNumber,
            cabinName: cabin?.name?.replace(/\D/g, "").padStart(2, "0") ?? "??",
            state: t.currentState as "CALLED" | "IN_PROGRESS",
          };
        }),
        waiting: waiting.map((t) => t.displayNumber),
      };
    })
  );

  // Find the most recently called token for announcement
  const lastCalled = await prisma.tokenEvent.findFirst({
    where: {
      toState: "CALLED",
      token: { sessionId: session.id },
    },
    orderBy: { createdAt: "desc" },
    include: {
      token: true,
      cabin: { include: { level: true } },
    },
  });

  const announcement = lastCalled
    ? `${lastCalled.token.displayNumber}, please proceed to Level ${lastCalled.cabin?.level?.order ?? "?"}, Counter ${lastCalled.cabin?.name?.replace(/\D/g, "").padStart(2, "0") ?? "?"}`
    : null;

  return NextResponse.json({
    levels: levelQueues,
    announcement,
  });
}
