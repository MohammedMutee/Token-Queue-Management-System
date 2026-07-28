import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { emitTokenUpdate } from "@/lib/socket-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ tokenId: string }> }) {
  const authSession = await auth();
  const userId = (authSession?.user as Record<string, unknown>)?.userId as number ?? 0;
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr);
  const body = await req.json();
  const cabinId = body.cabinId;

  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token || (token.currentState !== "CALLED" && token.currentState !== "IN_PROGRESS")) {
    return NextResponse.json({ error: "Token not in valid state" }, { status: 400 });
  }

  // No-show deactivates the token immediately — the person did not turn up, so
  // the token is removed from the queue (not re-queued).
  const nextNoShowCount = token.noShowCount + 1;
  const newState = "DEACTIVATED";

  await prisma.$transaction(async (tx) => {
    await tx.token.update({
      where: { id: tokenId },
      data: { currentState: "DEACTIVATED", currentCabinId: null, noShowCount: nextNoShowCount },
    });
    await tx.tokenEvent.create({
      data: {
        tokenId,
        fromState: token.currentState,
        toState: "DEACTIVATED",
        level: token.currentLevel,
        cabinId,
        remarks: "No-show — deactivated",
        createdBy: userId,
      },
    });
  });

  emitTokenUpdate({
    tokenId,
    displayNumber: token.displayNumber,
    newState,
    level: token.currentLevel,
    cabinId,
  });

  return NextResponse.json({ success: true });
}
