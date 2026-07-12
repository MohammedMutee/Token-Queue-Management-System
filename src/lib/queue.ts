import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import { emitTokenUpdate } from "./socket-server";

export async function getNextTokenForCabin(cabinId: number) {
  const cabin = await prisma.cabin.findUnique({
    where: { id: cabinId },
    include: { level: true },
  });
  if (!cabin) throw new Error("Cabin not found");

  const levelOrder = cabin.level.order;
  const strategy = cabin.level.queueSortStrategy;

  // Use a transaction with row-level locking to prevent double-assignment
  return prisma.$transaction(async (tx) => {
    // Priority 1: Reactivated tokens (always by token number)
    let token = await tx.token.findFirst({
      where: {
        currentState: "WAITING",
        currentLevel: levelOrder,
        priority: { gt: 0 },
        // Only tokens with same-cabin routing to this cabin
        OR: [
          { currentCabinId: cabinId },
          { currentCabinId: null, priority: { gt: 0 } },
        ],
      },
      orderBy: [{ priority: "desc" }, { tokenNumber: "asc" }],
    });

    // Priority 2: Regular tokens
    if (!token) {
      const orderBy: Prisma.TokenOrderByWithRelationInput =
        strategy === "TOKEN_ORDER"
          ? { tokenNumber: "asc" }
          : { updatedAt: "asc" };

      token = await tx.token.findFirst({
        where: {
          currentState: "WAITING",
          currentLevel: levelOrder,
          priority: 0,
          currentCabinId: null,
        },
        orderBy,
      });
    }

    if (!token) return null;

    // Assign token to this cabin
    const updated = await tx.token.update({
      where: { id: token.id },
      data: {
        currentState: "CALLED",
        currentCabinId: cabinId,
      },
    });

    await tx.tokenEvent.create({
      data: {
        tokenId: token.id,
        fromState: "WAITING",
        toState: "CALLED",
        level: levelOrder,
        cabinId,
        createdBy: cabin.operatorId ?? 0,
      },
    });

    emitTokenUpdate({
      tokenId: token.id,
      displayNumber: token.displayNumber,
      newState: "CALLED",
      level: levelOrder,
      cabinId,
      cabinName: cabin.name,
    });

    return updated;
  });
}

export async function callSpecificToken(cabinId: number, tokenId: number) {
  const cabin = await prisma.cabin.findUnique({
    where: { id: cabinId },
    include: { level: true },
  });
  if (!cabin) throw new Error("Cabin not found");

  const levelOrder = cabin.level.order;

  return prisma.$transaction(async (tx) => {
    const token = await tx.token.findUnique({
      where: { id: tokenId },
    });

    if (!token || token.currentState !== "WAITING" || token.currentLevel !== levelOrder) {
      return null;
    }

    if (token.currentCabinId !== null && token.currentCabinId !== cabinId) {
      return null;
    }

    const updated = await tx.token.update({
      where: { id: token.id },
      data: {
        currentState: "CALLED",
        currentCabinId: cabinId,
      },
    });

    await tx.tokenEvent.create({
      data: {
        tokenId: token.id,
        fromState: "WAITING",
        toState: "CALLED",
        level: levelOrder,
        cabinId,
        remarks: "Manually selected",
        createdBy: cabin.operatorId ?? 0,
      },
    });

    emitTokenUpdate({
      tokenId: token.id,
      displayNumber: token.displayNumber,
      newState: "CALLED",
      level: levelOrder,
      cabinId,
      cabinName: cabin.name,
    });

    return updated;
  });
}

export async function getQueueDepth(levelOrder: number) {
  return prisma.token.count({
    where: {
      currentState: "WAITING",
      currentLevel: levelOrder,
    },
  });
}
