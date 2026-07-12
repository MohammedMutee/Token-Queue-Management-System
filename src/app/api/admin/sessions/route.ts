import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getOrCreateTodaySession } from "@/lib/session";

export async function GET() {
  const todaySession = await getOrCreateTodaySession();

  const sessions = await prisma.session.findMany({
    orderBy: { date: "desc" },
    include: {
      tokens: {
        select: { currentState: true },
      },
    },
  });

  let current: {
    id: number;
    date: string;
    tokenCount: number;
    status: string;
  } | null = null;

  const past: {
    id: number;
    date: string;
    totalTokens: number;
    completed: number;
    hold: number;
    noShow: number;
  }[] = [];

  for (const s of sessions) {
    const tokenCount = s.tokens.length;
    const completed = s.tokens.filter((t) => t.currentState === "COMPLETED").length;
    const hold = s.tokens.filter((t) => t.currentState === "HOLD").length;
    const noShow = s.tokens.filter((t) => t.currentState === "NO_SHOW").length;

    if (s.id === todaySession.id && s.isActive) {
      current = {
        id: s.id,
        date: s.date.toISOString(),
        tokenCount,
        status: "ACTIVE",
      };
    } else {
      past.push({
        id: s.id,
        date: s.date.toISOString(),
        totalTokens: tokenCount,
        completed,
        hold,
        noShow,
      });
    }
  }

  return NextResponse.json({ current, past });
}

export async function POST(req: NextRequest) {
  const authSession = await auth();
  const userId = (authSession?.user as Record<string, unknown>)?.userId as number ?? 0;
  const body = await req.json();
  const { action } = body;

  if (action === "end") {
    const session = await getOrCreateTodaySession();

    const cancelableTokens = await prisma.token.findMany({
      where: {
        sessionId: session.id,
        currentState: { in: ["WAITING", "CALLED"] },
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const token of cancelableTokens) {
        await tx.token.update({
          where: { id: token.id },
          data: { currentState: "CANCELLED", currentCabinId: null },
        });
        await tx.tokenEvent.create({
          data: {
            tokenId: token.id,
            fromState: token.currentState,
            toState: "CANCELLED",
            level: token.currentLevel,
            remarks: "Session ended by admin",
            createdBy: userId,
          },
        });
      }

      await tx.session.update({
        where: { id: session.id },
        data: { isActive: false },
      });
    });

    return NextResponse.json({
      message: `Session ended. ${cancelableTokens.length} token(s) cancelled.`,
      cancelledCount: cancelableTokens.length,
    });
  }

  if (action === "reset") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingSession = await prisma.session.findUnique({ where: { date: today } });

    if (existingSession?.isActive) {
      return NextResponse.json(
        { error: "Current session is still active. End it first." },
        { status: 400 }
      );
    }

    if (existingSession) {
      const maxToken = await prisma.token.aggregate({
        where: { sessionId: existingSession.id },
        _max: { tokenNumber: true },
      });
      const lastTokenNo = maxToken._max.tokenNumber ?? 0;

      await prisma.session.update({
        where: { id: existingSession.id },
        data: { isActive: true, lastTokenNo },
      });
      return NextResponse.json({ message: "Session reset.", sessionId: existingSession.id });
    }

    const newSession = await prisma.session.create({
      data: { date: today, lastTokenNo: 0, isActive: true },
    });

    return NextResponse.json({ message: "New session created.", sessionId: newSession.id });
  }

  return NextResponse.json({ error: "Invalid action. Use 'end' or 'reset'." }, { status: 400 });
}
