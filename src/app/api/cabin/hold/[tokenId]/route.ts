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
  const remarks = body.remarks ?? "";

  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token || (token.currentState !== "IN_PROGRESS" && token.currentState !== "CALLED")) {
    return NextResponse.json({ error: "Token not in valid state for hold" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.token.update({
      where: { id: tokenId },
      data: { currentState: "HOLD", currentCabinId: null },
    });
    await tx.tokenEvent.create({
      data: { tokenId, fromState: token.currentState, toState: "HOLD", level: token.currentLevel, cabinId, remarks, createdBy: userId },
    });
  });

  emitTokenUpdate({
    tokenId,
    displayNumber: token.displayNumber,
    newState: "HOLD",
    level: token.currentLevel,
    cabinId,
  });

  return NextResponse.json({ success: true });
}
