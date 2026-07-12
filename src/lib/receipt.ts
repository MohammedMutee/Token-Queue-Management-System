// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  INIT: [ESC, 0x40],
  CENTER: [ESC, 0x61, 0x01],
  LEFT: [ESC, 0x61, 0x00],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_BOTH: [GS, 0x21, 0x11],
  NORMAL_SIZE: [GS, 0x21, 0x00],
  CUT: [GS, 0x56, 0x42, 0x03],
  FEED: [ESC, 0x64, 0x04],
};

const encoder = new TextEncoder();

function text(s: string): number[] {
  return Array.from(encoder.encode(s));
}

function line(s: string): number[] {
  return [...text(s), LF];
}

function dashes(n = 32): number[] {
  return line("-".repeat(n));
}

export interface ReceiptData {
  tokenNumber: string;
  name?: string;
  levelName: string;
  queuePosition: number;
  issuedAt: Date;
  orgName?: string;
}

export type PrintMode = "usb" | "network" | "browser";

export interface PrinterConfig {
  mode: PrintMode;
  usbPrinter?: string;
  networkHost?: string;
  networkPort?: number;
}

const STORAGE_KEY = "printer-config";

export function savePrinterConfig(config: PrinterConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* */ }
}

export function loadPrinterConfig(): PrinterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return { mode: "browser" };
}

export function buildEscPosCommands(data: ReceiptData): number[] {
  const org = data.orgName || "Token Queue System";
  const time = data.issuedAt.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = data.issuedAt.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const bytes: number[] = [
    ...CMD.INIT,
    ...CMD.CENTER,
    ...CMD.BOLD_ON,
    ...line(org),
    ...CMD.BOLD_OFF,
    ...dashes(),
    LF,
    ...CMD.DOUBLE_BOTH,
    ...line(data.tokenNumber),
    LF,
    ...CMD.NORMAL_SIZE,
    ...CMD.BOLD_ON,
    ...line(data.levelName),
    ...CMD.BOLD_OFF,
    LF,
    ...dashes(),
    ...CMD.LEFT,
  ];

  if (data.name) {
    bytes.push(...line(`Name: ${data.name}`));
  }
  bytes.push(...line(`Position: #${data.queuePosition}`));
  bytes.push(...line(`Date: ${date}`));
  bytes.push(...line(`Time: ${time}`));

  bytes.push(
    ...CMD.CENTER,
    LF,
    ...dashes(),
    ...line("Please wait for your number"),
    ...line("to appear on the display."),
    ...dashes(),
    LF,
    ...CMD.FEED,
    ...CMD.CUT,
  );

  return bytes;
}

export function buildHtmlReceipt(data: ReceiptData): string {
  const org = data.orgName || "Token Queue System";
  const time = data.issuedAt.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = data.issuedAt.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `<!DOCTYPE html>
<html>
<head>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', monospace;
    width: 80mm;
    padding: 4mm;
    color: #000;
  }
  .center { text-align: center; }
  .org { font-size: 14px; font-weight: bold; margin-bottom: 4px; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .token {
    font-size: 48px;
    font-weight: 900;
    letter-spacing: 4px;
    margin: 12px 0 4px;
  }
  .level { font-size: 14px; font-weight: bold; margin-bottom: 8px; }
  .info { font-size: 12px; text-align: left; margin: 2px 0; }
  .info span { font-weight: bold; }
  .footer { font-size: 11px; color: #555; margin-top: 4px; }
</style>
</head>
<body>
  <div class="center">
    <div class="org">${org}</div>
    <div class="divider"></div>
    <div class="token">${data.tokenNumber}</div>
    <div class="level">${data.levelName}</div>
    <div class="divider"></div>
  </div>
  ${data.name ? `<div class="info">Name: <span>${data.name}</span></div>` : ""}
  <div class="info">Position: <span>#${data.queuePosition}</span></div>
  <div class="info">Date: <span>${date}</span></div>
  <div class="info">Time: <span>${time}</span></div>
  <div class="center">
    <div class="divider"></div>
    <div class="footer">Please wait for your number<br>to appear on the display.</div>
    <div class="divider"></div>
  </div>
</body>
</html>`;
}

// --------------- QZ Tray Integration ---------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let qz: any = null;
let qzConnected = false;

async function getQz() {
  if (qz) return qz;
  try {
    const mod = await import("qz-tray");
    qz = mod.default ?? mod;
  } catch {
    qz = null;
  }
  return qz;
}

export async function connectQz(): Promise<boolean> {
  const q = await getQz();
  if (!q) return false;

  if (q.websocket.isActive()) {
    qzConnected = true;
    return true;
  }

  try {
    q.security.setCertificatePromise(async () => {
      const res = await fetch("/api/qz-cert");
      if (!res.ok) return "";
      return await res.text();
    });
    q.security.setSignatureAlgorithm("SHA512");
    q.security.setSignaturePromise(async (dataToSign: string) => {
      const res = await fetch("/api/qz-sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataToSign }),
      });
      const { signature } = await res.json();
      return signature || "";
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("QZ Tray connection timed out")), 5000)
    );
    await Promise.race([q.websocket.connect(), timeout]);
    qzConnected = true;
    return true;
  } catch {
    if (q.websocket.isActive()) {
      qzConnected = true;
      return true;
    }
    qzConnected = false;
    return false;
  }
}

export function isQzConnected(): boolean {
  if (qz && qz.websocket.isActive()) {
    qzConnected = true;
    return true;
  }
  return qzConnected;
}

export async function listPrinters(): Promise<string[]> {
  const q = await getQz();
  if (!q || !qzConnected) return [];
  try {
    return await q.printers.find();
  } catch {
    return [];
  }
}

// Print via USB printer (QZ Tray discovers local printers)
async function printViaUsb(data: ReceiptData, printerName: string): Promise<void> {
  const q = await getQz();
  if (!q || !qzConnected) throw new Error("QZ Tray not connected");
  if (!printerName) throw new Error("No USB printer selected");

  const escpos = buildEscPosCommands(data);
  const base64 = btoa(String.fromCharCode(...escpos));

  const config = q.configs.create(printerName, { encoding: "UTF-8" });
  const printData = [{ type: "raw", format: "base64", data: base64 }];

  await q.print(config, printData);
}

// Print via network printer (QZ Tray raw TCP socket)
// Each job: open → send → close. Clean isolation, no data mixing.
async function printViaNetwork(data: ReceiptData, host: string, port: number): Promise<void> {
  const q = await getQz();
  if (!q || !qzConnected) throw new Error("QZ Tray not connected");
  if (!host || !port) throw new Error("Network printer IP/port not configured");

  const escpos = buildEscPosCommands(data);
  const raw = String.fromCharCode(...escpos);

  await q.socket.open(host, port);
  await q.socket.sendData(host, port, { data: raw, type: "PLAIN" });
  await new Promise((r) => setTimeout(r, 300));
  await q.socket.close(host, port).catch(() => {});
}

// Print via browser print dialog (fallback)
export function printViaBrowser(data: ReceiptData): void {
  const html = buildHtmlReceipt(data);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;width:80mm;height:0;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    }, 2000);
  }, 300);
}

// --------------- Print Queue (serializes all print jobs) ---------------

let printQueue: Promise<void> = Promise.resolve();

export function printReceipt(data: ReceiptData, config: PrinterConfig): Promise<void> {
  const job = printQueue.then(() => executePrint(data, config));
  // Update queue tail — catch so a failed job doesn't block the next one
  printQueue = job.catch(() => {});
  return job;
}

async function executePrint(data: ReceiptData, config: PrinterConfig): Promise<void> {
  switch (config.mode) {
    case "usb":
      if (!config.usbPrinter) throw new Error("No USB printer selected");
      await printViaUsb(data, config.usbPrinter);
      break;
    case "network":
      if (!config.networkHost || !config.networkPort) throw new Error("Network printer not configured");
      await printViaNetwork(data, config.networkHost, config.networkPort);
      break;
    case "browser":
      printViaBrowser(data);
      break;
  }
}
