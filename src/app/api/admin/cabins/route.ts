import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitCabinStatus } from "@/lib/socket-server";

export async function GET() {
  const cabins = await prisma.cabin.findMany({
    include: {
      level: { select: { id: true, name: true, order: true } },
      operator: { select: { id: true, name: true, username: true } },
    },
    orderBy: [{ levelId: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    cabins: cabins.map((c) => ({
      id: c.id,
      name: c.name,
      levelId: c.level.id,
      levelName: c.level.name,
      operatorId: c.operator?.id ?? null,
      operatorName: c.operator?.name ?? null,
      isActive: c.isActive,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, levelId } = body;

  if (!name || !levelId) {
    return NextResponse.json({ error: "name and levelId are required" }, { status: 400 });
  }

  const level = await prisma.level.findUnique({ where: { id: levelId } });
  if (!level) {
    return NextResponse.json({ error: "Level not found" }, { status: 404 });
  }

  const cabin = await prisma.cabin.create({
    data: { name, levelId, isActive: true },
    include: {
      level: { select: { id: true, name: true, order: true } },
      operator: { select: { id: true, name: true, username: true } },
    },
  });

  return NextResponse.json({
    id: cabin.id,
    name: cabin.name,
    levelId: cabin.level.id,
    levelName: cabin.level.name,
    operatorId: cabin.operator?.id ?? null,
    operatorName: cabin.operator?.name ?? null,
    isActive: cabin.isActive,
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") ?? "0");

  if (!id) {
    return NextResponse.json({ error: "Cabin id is required" }, { status: 400 });
  }

  const cabin = await prisma.cabin.findUnique({ where: { id } });
  if (!cabin) {
    return NextResponse.json({ error: "Cabin not found" }, { status: 404 });
  }

  const activeTokens = await prisma.token.count({
    where: {
      currentCabinId: id,
      currentState: { in: ["CALLED", "IN_PROGRESS"] },
    },
  });

  if (activeTokens > 0) {
    return NextResponse.json(
      { error: "Cannot delete cabin with active tokens. Clear them first." },
      { status: 409 }
    );
  }

  await prisma.cabin.update({
    where: { id },
    data: { isActive: false, operatorId: null },
  });

  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, operatorId, isActive } = body;

  if (!id) {
    return NextResponse.json({ error: "Cabin id is required" }, { status: 400 });
  }

  const cabin = await prisma.cabin.findUnique({ where: { id } });
  if (!cabin) {
    return NextResponse.json({ error: "Cabin not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (operatorId !== undefined) data.operatorId = operatorId;
  if (isActive !== undefined) data.isActive = isActive;

  const updated = await prisma.cabin.update({
    where: { id },
    data,
    include: {
      level: { select: { id: true, name: true, order: true } },
      operator: { select: { id: true, name: true, username: true } },
    },
  });

  emitCabinStatus({
    cabinId: updated.id,
    cabinName: updated.name,
    isActive: updated.isActive,
  });

  return NextResponse.json(updated);
}
