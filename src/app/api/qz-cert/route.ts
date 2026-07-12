import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

let cert: string | null = null;

export async function GET() {
  try {
    if (!cert) {
      const certPath = path.join(process.cwd(), "certs", "qz-cert.pem");
      cert = fs.readFileSync(certPath, "utf-8");
    }
    return new NextResponse(cert, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch {
    return NextResponse.json({ error: "Certificate not found" }, { status: 500 });
  }
}
