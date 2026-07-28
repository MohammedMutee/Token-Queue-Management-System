import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateTodaySession } from "@/lib/session";
import { auth } from "@/lib/auth";
import { emitTokenUpdate } from "@/lib/socket-server";

export async function POST(req: NextRequest) {
  const authSession = await auth();
  const userId = (authSession?.user as Record<string, unknown>)?.userId as number ?? 0;
  const body = await req.json();
  const session = await getOrCreateTodaySession();

  const token = await prisma.$transaction(async (tx) => {
    // Atomically increment inside the transaction so two simultaneous
    // "Issue Token" clicks can never compute the same number (which would
    // otherwise hit the unique constraint and throw a 500).
    const updatedSession = await tx.session.update({
      where: { id: session.id },
      data: { lastTokenNo: { increment: 1 } },
    });
    const nextNo = updatedSession.lastTokenNo;
    const displayNumber = `T-${String(nextNo).padStart(3, "0")}`;

    const created = await tx.token.create({
      data: {
        tokenNumber: nextNo,
        displayNumber,
        sessionId: session.id,
        currentState: "WAITING",
        currentLevel: 1,
        metadata: {
          name: body.name || null,
          phone: body.phone || null,
        },
      },
    });

    await tx.tokenEvent.create({
      data: {
        tokenId: created.id,
        fromState: null,
        toState: "WAITING",
        level: 1,
        createdBy: userId,
      },
    });

    return created;
  });

  emitTokenUpdate({
    tokenId: token.id,
    displayNumber: token.displayNumber,
    newState: "WAITING",
    level: 1,
  });

  const [queuePosition, level] = await Promise.all([
    prisma.token.count({
      where: {
        sessionId: session.id,
        currentState: "WAITING",
        currentLevel: 1,
        tokenNumber: { lte: token.tokenNumber },
      },
    }),
    prisma.level.findFirst({ where: { order: 1 } }),
  ]);

  return NextResponse.json({
    ...token,
    queuePosition,
    levelName: level?.name ?? "Document Verification",
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view");
  const search = searchParams.get("search");
  const session = await getOrCreateTodaySession();

  if (search) {
    const searchUpper = search.toUpperCase().replace(/[^0-9T-]/g, "");
    const token = await prisma.token.findFirst({
      where: {
        sessionId: session.id,
        displayNumber: { contains: searchUpper, mode: "insensitive" },
      },
      include: {
        events: {
          where: { toState: "HOLD" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { cabin: { include: { operator: true } } },
        },
      },
    });

    if (!token) {
      return NextResponse.json({ token: null });
    }

    const holdEvent = token.events[0];
    return NextResponse.json({
      token: {
        id: token.id,
        displayNumber: token.displayNumber,
        currentState: token.currentState,
        currentLevel: token.currentLevel,
        cabinName: holdEvent?.cabin?.name ?? null,
        operatorName: holdEvent?.cabin?.operator?.name ?? null,
        holdReason: holdEvent?.remarks ?? null,
        createdAt: token.createdAt,
      },
    });
  }

  if (view === "reception") {
    const nextNo = session.lastTokenNo + 1;
    const nextToken = `T-${String(nextNo).padStart(3, "0")}`;

    const [issued, waiting, completed, hold, noShow, activeCabins, recent, reactivatable] = await Promise.all([
      prisma.token.count({ where: { sessionId: session.id } }),
      prisma.token.count({ where: { sessionId: session.id, currentState: "WAITING" } }),
      prisma.token.count({ where: { sessionId: session.id, currentState: "COMPLETED" } }),
      prisma.token.count({ where: { sessionId: session.id, currentState: "HOLD" } }),
      prisma.token.count({ where: { sessionId: session.id, currentState: "NO_SHOW" } }),
      prisma.cabin.count({ where: { isActive: true } }),
      // All of today's tokens (not just the latest 10), newest first.
      prisma.token.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "desc" },
      }),
      // Tokens that can be reactivated: on HOLD, or DEACTIVATED by a no-show.
      // Most-recent event gives the reason (hold note / "No-show — deactivated")
      // and the counter it was last at.
      prisma.token.findMany({
        where: { sessionId: session.id, currentState: { in: ["HOLD", "DEACTIVATED"] } },
        orderBy: { updatedAt: "desc" },
        include: {
          events: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { cabin: { include: { operator: true } } },
          },
        },
      }),
    ]);

    return NextResponse.json({
      nextToken,
      summary: { issued, waiting, completed, hold, noShow, activeCabins },
      recent,
      reactivatableTokens: reactivatable.map((t) => ({
        id: t.id,
        displayNumber: t.displayNumber,
        currentLevel: t.currentLevel,
        currentState: t.currentState,
        cabinName: t.events[0]?.cabin?.name ?? null,
        operatorName: t.events[0]?.cabin?.operator?.name ?? null,
        reason: t.events[0]?.remarks ?? null,
      })),
    });
  }

  return NextResponse.json({ error: "Missing view parameter" }, { status: 400 });
}
