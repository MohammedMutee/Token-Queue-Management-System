import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";

let privateKey: string | null = null;

function getPrivateKey(): string {
  if (privateKey) return privateKey;
  const keyPath = path.join(process.cwd(), "certs", "qz-private.pem");
  privateKey = fs.readFileSync(keyPath, "utf-8");
  return privateKey;
}

export async function POST(req: NextRequest) {
  try {
    const { data } = await req.json();
    if (!data || typeof data !== "string") {
      return NextResponse.json({ error: "Missing data to sign" }, { status: 400 });
    }

    const key = getPrivateKey();
    const sign = crypto.createSign("SHA512");
    sign.update(data);
    const signature = sign.sign(key, "base64");

    return NextResponse.json({ signature });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signing failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
