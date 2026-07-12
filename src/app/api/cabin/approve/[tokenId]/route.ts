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
  if (!token || token.currentState !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Token not in IN_PROGRESS state" }, { status: 400 });
  }

  const nextLevel = await prisma.level.findFirst({
    where: { order: token.currentLevel + 1, isActive: true },
  });

  await prisma.$transaction(async (tx) => {
    if (nextLevel) {
      await tx.token.update({
        where: { id: tokenId },
        data: {
          currentState: "WAITING",
          currentLevel: nextLevel.order,
          currentCabinId: null,
          priority: 0,
        },
      });
      await tx.tokenEvent.create({
        data: { tokenId, fromState: "IN_PROGRESS", toState: "APPROVED", level: token.currentLevel, cabinId, createdBy: userId },
      });
      await tx.tokenEvent.create({
        data: { tokenId, fromState: "APPROVED", toState: "WAITING", level: nextLevel.order, createdBy: userId },
      });
    } else {
      await tx.token.update({
        where: { id: tokenId },
        data: { currentState: "COMPLETED", currentCabinId: null },
      });
      await tx.tokenEvent.create({
        data: { tokenId, fromState: "IN_PROGRESS", toState: "COMPLETED", level: token.currentLevel, cabinId, createdBy: userId },
      });
    }
  });

  emitTokenUpdate({
    tokenId,
    displayNumber: token.displayNumber,
    newState: nextLevel ? "WAITING" : "COMPLETED",
    level: nextLevel ? nextLevel.order : token.currentLevel,
    cabinId,
  });

  return NextResponse.json({ success: true, nextLevel: nextLevel ? nextLevel.order : null });
}
