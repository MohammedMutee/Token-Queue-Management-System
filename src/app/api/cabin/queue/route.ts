import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getOrCreateTodaySession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cabinId = parseInt(searchParams.get("cabinId") ?? "0");

  const cabin = await prisma.cabin.findUnique({
    where: { id: cabinId },
    include: { level: true },
  });

  if (!cabin) {
    return NextResponse.json({ error: "Cabin not found" }, { status: 404 });
  }

  const session = await getOrCreateTodaySession();
  const levelOrder = cabin.level.order;
  const strategy = cabin.level.queueSortStrategy;

  const orderBy: Prisma.TokenOrderByWithRelationInput[] =
    strategy === "TOKEN_ORDER"
      ? [{ priority: "desc" }, { tokenNumber: "asc" }]
      : [{ priority: "desc" }, { updatedAt: "asc" }];

  const tokens = await prisma.token.findMany({
    where: {
      sessionId: session.id,
      currentState: "WAITING",
      currentLevel: levelOrder,
    },
    orderBy,
    take: 50,
  });

  return NextResponse.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      displayNumber: t.displayNumber,
      name: (t.metadata as { name?: string } | null)?.name ?? null,
      waitMinutes: Math.round((Date.now() - new Date(t.createdAt).getTime()) / 60000),
      priority: t.priority,
    })),
  });
}
