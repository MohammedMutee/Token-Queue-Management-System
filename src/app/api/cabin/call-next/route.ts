import { NextRequest, NextResponse } from "next/server";
import { getNextTokenForCabin } from "@/lib/queue";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const cabinId = body.cabinId;

  if (!cabinId) {
    return NextResponse.json({ error: "cabinId required" }, { status: 400 });
  }

  const token = await getNextTokenForCabin(cabinId);
  if (!token) {
    return NextResponse.json({ error: "No tokens in queue" }, { status: 404 });
  }

  return NextResponse.json(token);
}
