import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr);
  const body = await req.json();
  const cabinId = body.cabinId;

  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token || (token.currentState !== "CALLED" && token.currentState !== "IN_PROGRESS")) {
    return NextResponse.json({ error: "Token not in valid state" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.token.update({
      where: { id: tokenId },
      data: {
        currentState: "WAITING",
        currentCabinId: null,
      },
    });
    await tx.tokenEvent.create({
      data: {
        tokenId,
        fromState: token.currentState,
        toState: "WAITING",
        level: token.currentLevel,
        cabinId,
        remarks: "Skipped — re-queued",
        createdBy: 0,
      },
    });
  });

  return NextResponse.json({ success: true });
}
