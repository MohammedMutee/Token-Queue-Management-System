import { NextRequest, NextResponse } from "next/server";
import { callSpecificToken } from "@/lib/queue";

export async function POST(req: NextRequest, { params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr);
  const body = await req.json();
  const cabinId = body.cabinId;

  if (!cabinId) {
    return NextResponse.json({ error: "cabinId required" }, { status: 400 });
  }

  const token = await callSpecificToken(cabinId, tokenId);
  if (!token) {
    return NextResponse.json(
      { error: "Token is no longer available (already called or wrong level)" },
      { status: 409 }
    );
  }

  return NextResponse.json(token);
}
