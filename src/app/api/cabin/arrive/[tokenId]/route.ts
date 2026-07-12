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
  if (!token || token.currentState !== "CALLED") {
    return NextResponse.json({ error: "Token not in CALLED state" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.token.update({
      where: { id: tokenId },
      data: { currentState: "IN_PROGRESS" },
    });
    await tx.tokenEvent.create({
      data: {
        tokenId,
        fromState: "CALLED",
        toState: "IN_PROGRESS",
        level: token.currentLevel,
        cabinId,
        createdBy: userId,
      },
    });
  });

  emitTokenUpdate({
    tokenId,
    displayNumber: token.displayNumber,
    newState: "IN_PROGRESS",
    level: token.currentLevel,
    cabinId,
  });

  return NextResponse.json({ success: true });
}
