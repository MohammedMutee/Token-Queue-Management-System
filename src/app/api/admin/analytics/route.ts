import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");

  const targetDate = dateParam ? new Date(dateParam) : new Date();
  targetDate.setHours(0, 0, 0, 0);

  const session = await prisma.session.findUnique({ where: { date: targetDate } });
  if (!session) {
    return NextResponse.json({ error: "No session found for this date" }, { status: 404 });
  }

  const [events, levels, cabins, tokens] = await Promise.all([
    prisma.tokenEvent.findMany({
      where: { token: { sessionId: session.id } },
      select: {
        tokenId: true,
        fromState: true,
        toState: true,
        level: true,
        cabinId: true,
        remarks: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.level.findMany({ orderBy: { order: "asc" } }),
    prisma.cabin.findMany({
      include: { level: { select: { name: true, order: true } } },
      orderBy: [{ levelId: "asc" }, { name: "asc" }],
    }),
    prisma.token.groupBy({
      by: ["currentState"],
      where: { sessionId: session.id },
      _count: true,
    }),
  ]);

  const tokenCounts: Record<string, number> = {};
  for (const t of tokens) {
    tokenCounts[t.currentState] = t._count;
  }

  type EventRow = (typeof events)[number];
  const eventsByToken: Record<number, EventRow[]> = {};
  for (const evt of events) {
    if (!eventsByToken[evt.tokenId]) eventsByToken[evt.tokenId] = [];
    eventsByToken[evt.tokenId].push(evt);
  }

  const levelStats: Record<number, { waitTimes: number[]; processTimes: number[]; tokenCount: number }> = {};
  for (const level of levels) {
    levelStats[level.order] = { waitTimes: [], processTimes: [], tokenCount: 0 };
  }

  const cabinStats: Record<number, { processedCount: number; processTimes: number[] }> = {};
  for (const cabin of cabins) {
    cabinStats[cabin.id] = { processedCount: 0, processTimes: [] };
  }

  const hourlyThroughput: Record<number, number> = {};
  const holdReasons: Record<string, number> = {};

  for (const tokenEvents of Object.values(eventsByToken)) {
    const byLevel: Record<number, { waitStart?: Date; callTime?: Date; startTime?: Date; endTime?: Date; cabinId?: number }> = {};

    for (const evt of tokenEvents) {
      if (!byLevel[evt.level]) byLevel[evt.level] = {};
      const lev = byLevel[evt.level];

      if (evt.toState === "WAITING") {
        lev.waitStart = evt.createdAt;
        if (levelStats[evt.level]) levelStats[evt.level].tokenCount++;
      }
      if (evt.toState === "CALLED") {
        lev.callTime = evt.createdAt;
        lev.cabinId = evt.cabinId ?? undefined;
      }
      if (evt.toState === "IN_PROGRESS") {
        lev.startTime = evt.createdAt;
        lev.cabinId = evt.cabinId ?? lev.cabinId;
      }
      if (evt.toState === "APPROVED" || evt.toState === "COMPLETED") {
        lev.endTime = evt.createdAt;
      }
      if (evt.toState === "HOLD" && evt.remarks) {
        holdReasons[evt.remarks] = (holdReasons[evt.remarks] || 0) + 1;
      }
      if (evt.toState === "COMPLETED") {
        const hour = evt.createdAt.getHours();
        hourlyThroughput[hour] = (hourlyThroughput[hour] || 0) + 1;
      }
    }

    for (const [levelOrder, data] of Object.entries(byLevel)) {
      const lo = Number(levelOrder);
      if (data.waitStart && data.callTime && levelStats[lo]) {
        levelStats[lo].waitTimes.push(data.callTime.getTime() - data.waitStart.getTime());
      }
      if (data.startTime && data.endTime) {
        const processTime = data.endTime.getTime() - data.startTime.getTime();
        if (levelStats[lo]) levelStats[lo].processTimes.push(processTime);
        if (data.cabinId && cabinStats[data.cabinId]) {
          cabinStats[data.cabinId].processedCount++;
          cabinStats[data.cabinId].processTimes.push(processTime);
        }
      }
    }
  }

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length / 1000) : null;

  const perLevel = levels.map((l) => {
    const stats = levelStats[l.order];
    return {
      levelId: l.id,
      levelName: l.name,
      levelOrder: l.order,
      tokenCount: stats.tokenCount,
      avgWaitSeconds: avg(stats.waitTimes),
      avgProcessSeconds: avg(stats.processTimes),
    };
  });

  const perCabin = cabins.map((c) => {
    const stats = cabinStats[c.id];
    return {
      cabinId: c.id,
      cabinName: c.name,
      levelName: c.level.name,
      processedCount: stats.processedCount,
      avgProcessSeconds: avg(stats.processTimes),
    };
  });

  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    completed: hourlyThroughput[h] || 0,
  })).filter((h) => h.completed > 0);

  const holdReasonsArray = Object.entries(holdReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    date: targetDate,
    sessionId: session.id,
    tokenCounts,
    perLevel,
    perCabin,
    hourlyThroughput: hourly,
    holdReasons: holdReasonsArray,
  });
}
