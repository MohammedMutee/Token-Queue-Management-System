import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import { emitTokenUpdate } from "./socket-server";
import { getOrCreateTodaySession } from "./session";

export async function getNextTokenForCabin(cabinId: number) {
  const cabin = await prisma.cabin.findUnique({
    where: { id: cabinId },
    include: { level: true },
  });
  if (!cabin) throw new Error("Counter not found");

  const levelOrder = cabin.level.order;
  const strategy = cabin.level.queueSortStrategy;
  // Only ever operate on the CURRENT day's session. Without this the queue
  // would pull WAITING tokens left over from previous sessions, which then
  // don't render in the session-scoped operator view ("can't call any").
  const session = await getOrCreateTodaySession();

  return prisma.$transaction(async (tx) => {
    // If this counter already has an active token, resume it instead of
    // pulling a new one. This prevents "orphan" tokens (multiple CALLED /
    // IN_PROGRESS tokens stuck on the same counter) when the UI is refreshed
    // mid-flow and the operator presses "Call Next" again.
    const active = await tx.token.findFirst({
      where: {
        sessionId: session.id,
        currentCabinId: cabinId,
        currentState: { in: ["CALLED", "IN_PROGRESS"] },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (active) return active;

    // Priority 1: Reactivated tokens (always by token number)
    let token = await tx.token.findFirst({
      where: {
        sessionId: session.id,
        currentState: "WAITING",
        currentLevel: levelOrder,
        priority: { gt: 0 },
        // Same-counter routing to this counter, or unrouted priority tokens
        OR: [{ currentCabinId: cabinId }, { currentCabinId: null }],
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
          sessionId: session.id,
          currentState: "WAITING",
          currentLevel: levelOrder,
          priority: 0,
          currentCabinId: null,
        },
        orderBy,
      });
    }

    if (!token) return null;

    // Atomically claim the token: only succeeds if it is STILL WAITING.
    // This is the real lock — a concurrent counter that already claimed it
    // will have flipped currentState, so our updateMany matches 0 rows.
    const claim = await tx.token.updateMany({
      where: { id: token.id, currentState: "WAITING" },
      data: { currentState: "CALLED", currentCabinId: cabinId },
    });
    if (claim.count === 0) return null; // someone else grabbed it first

    const updated = await tx.token.findUniqueOrThrow({ where: { id: token.id } });

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
  if (!cabin) throw new Error("Counter not found");

  const levelOrder = cabin.level.order;
  const session = await getOrCreateTodaySession();

  return prisma.$transaction(async (tx) => {
    // Refuse if this counter is already serving a different token — otherwise
    // we'd orphan the current one.
    const active = await tx.token.findFirst({
      where: {
        sessionId: session.id,
        currentCabinId: cabinId,
        currentState: { in: ["CALLED", "IN_PROGRESS"] },
      },
    });
    if (active && active.id !== tokenId) return null;

    const token = await tx.token.findUnique({ where: { id: tokenId } });

    if (
      !token ||
      token.sessionId !== session.id ||
      token.currentState !== "WAITING" ||
      token.currentLevel !== levelOrder
    ) {
      return null;
    }

    if (token.currentCabinId !== null && token.currentCabinId !== cabinId) {
      return null;
    }

    // Atomic claim — guard on WAITING so two operators can't grab the same one.
    const claim = await tx.token.updateMany({
      where: { id: token.id, currentState: "WAITING" },
      data: { currentState: "CALLED", currentCabinId: cabinId },
    });
    if (claim.count === 0) return null;

    const updated = await tx.token.findUniqueOrThrow({ where: { id: token.id } });

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
  const session = await getOrCreateTodaySession();
  return prisma.token.count({
    where: {
      sessionId: session.id,
      currentState: "WAITING",
      currentLevel: levelOrder,
    },
  });
}
