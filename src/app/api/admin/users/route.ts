import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      cabins: {
        select: {
          id: true,
          name: true,
          level: { select: { id: true, name: true, order: true } },
        },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const mapped = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    cabinName: u.cabins.map((c) => `${c.name} (${c.level.name})`).join(", ") || null,
  }));

  return NextResponse.json({ users: mapped });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password, name, role } = body;

  if (!username || !password || !name || !role) {
    return NextResponse.json({ error: "Missing required fields: username, password, name, role" }, { status: 400 });
  }

  if (!["ADMIN", "RECEPTION", "CABIN_OPERATOR"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { username, password: hashedPassword, name, role },
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
  });

  return NextResponse.json(user, { status: 201 });
}
