import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const levels = await prisma.level.findMany({
    orderBy: { order: "asc" },
    include: {
      _count: { select: { cabins: true } },
    },
  });

  return NextResponse.json({
    levels: levels.map((l) => ({
      id: l.id,
      name: l.name,
      order: l.order,
      isActive: l.isActive,
      queueSortStrategy: l.queueSortStrategy,
      cabinCount: l._count.cabins,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, name, queueSortStrategy, isActive } = body;

  if (!id) {
    return NextResponse.json({ error: "Level id is required" }, { status: 400 });
  }

  const level = await prisma.level.findUnique({ where: { id } });
  if (!level) {
    return NextResponse.json({ error: "Level not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (queueSortStrategy !== undefined) {
    if (!["TOKEN_ORDER", "APPROVAL_TIME"].includes(queueSortStrategy)) {
      return NextResponse.json({ error: "Invalid queueSortStrategy" }, { status: 400 });
    }
    data.queueSortStrategy = queueSortStrategy;
  }
  if (isActive !== undefined) data.isActive = isActive;

  const updated = await prisma.level.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}
