import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { emitTokenUpdate } from "@/lib/socket-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authSession = await auth();
  const userId = (authSession?.user as Record<string, unknown>)?.userId as number ?? 0;
  const { id } = await params;
  const tokenId = parseInt(id);
  const body = await req.json();
  const mode: "SAME_CABIN" | "ANY_AVAILABLE" = body.mode ?? "ANY_AVAILABLE";

  const token = await prisma.token.findUnique({
    where: { id: tokenId },
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
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }
  if (token.currentState !== "HOLD" && token.currentState !== "DEACTIVATED") {
    return NextResponse.json({ error: "Token cannot be reactivated from current state" }, { status: 400 });
  }

  const holdEvent = token.events[0];
  let assignedCabinId: number | null = null;
  let message = "";

  if (mode === "SAME_CABIN" && holdEvent?.cabinId) {
    const cabin = await prisma.cabin.findUnique({
      where: { id: holdEvent.cabinId },
      include: { operator: true },
    });
    if (cabin?.isActive && cabin.operatorId) {
      assignedCabinId = cabin.id;
      message = `${token.displayNumber} reactivated — routed to ${cabin.name}${cabin.operator ? ` (${cabin.operator.name})` : ""}`;
    } else {
      message = `${token.displayNumber} reactivated — original cabin offline, added to queue with priority`;
    }
  } else {
    message = `${token.displayNumber} reactivated — added to Level ${token.currentLevel} queue with priority`;
  }

  await prisma.$transaction(async (tx) => {
    await tx.token.update({
      where: { id: tokenId },
      data: { currentState: "WAITING", priority: 1, currentCabinId: assignedCabinId },
    });
    await tx.tokenEvent.create({
      data: { tokenId, fromState: token.currentState, toState: "WAITING", level: token.currentLevel, cabinId: assignedCabinId, remarks: `Reactivated (${mode})`, createdBy: userId },
    });
  });

  emitTokenUpdate({
    tokenId,
    displayNumber: token.displayNumber,
    newState: "WAITING",
    level: token.currentLevel,
  });

  return NextResponse.json({ message });
}
