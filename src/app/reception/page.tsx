"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  printReceipt as doPrint,
  printViaBrowser,
  connectQz,
  isQzConnected,
  listPrinters,
  savePrinterConfig,
  loadPrinterConfig,
  type ReceiptData,
  type PrintMode,
  type PrinterConfig,
} from "@/lib/receipt";

interface TokenSummary {
  issued: number;
  waiting: number;
  completed: number;
  hold: number;
  noShow: number;
  activeCabins: number;
}

interface RecentToken {
  id: number;
  displayNumber: string;
  currentState: string;
  currentLevel: number;
  createdAt: string;
  metadata: { name?: string } | null;
}

interface ReactivatableToken {
  id: number;
  displayNumber: string;
  currentLevel: number;
  currentState: string;
  cabinName: string | null;
  operatorName: string | null;
  reason: string | null;
}

interface SearchResult {
  id: number;
  displayNumber: string;
  currentState: string;
  currentLevel: number;
  cabinName: string | null;
  operatorName: string | null;
  holdReason: string | null;
  createdAt: string;
}

export default function ReceptionPage() {
  const [nextToken, setNextToken] = useState("T-001");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>({ mode: "browser" });
  const [qzStatus, setQzStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [usbPrinters, setUsbPrinters] = useState<string[]>([]);
  const [networkHost, setNetworkHost] = useState("");
  const [networkPort, setNetworkPort] = useState("9100");
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [reactivateMode, setReactivateMode] = useState<"SAME_CABIN" | "ANY_AVAILABLE">("SAME_CABIN");
  const [reactivating, setReactivating] = useState(false);
  const [reactivateSuccess, setReactivateSuccess] = useState<string | null>(null);

  const [summary, setSummary] = useState<TokenSummary>({ issued: 0, waiting: 0, completed: 0, hold: 0, noShow: 0, activeCabins: 0 });
  const [recentTokens, setRecentTokens] = useState<RecentToken[]>([]);
  const [reactivatableTokens, setReactivatableTokens] = useState<ReactivatableToken[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/tokens?view=reception");
      if (res.ok) {
        const data = await res.json();
        setNextToken(data.nextToken ?? "T-001");
        setSummary(data.summary ?? summary);
        setRecentTokens(data.recent ?? []);
        setReactivatableTokens(data.reactivatableTokens ?? []);
      }
    } catch { /* retry next interval */ }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Load saved printer config on mount
  useEffect(() => {
    const saved = loadPrinterConfig();
    setPrinterConfig(saved);
    if (saved.networkHost) setNetworkHost(saved.networkHost);
    if (saved.networkPort) setNetworkPort(String(saved.networkPort));
    if (saved.mode === "usb" || saved.mode === "network") {
      tryConnectQz();
    }
  }, []);

  async function tryConnectQz() {
    if (isQzConnected()) {
      setQzStatus("connected");
      const found = await listPrinters();
      setUsbPrinters(found);
      return true;
    }
    setQzStatus("connecting");
    const ok = await connectQz();
    if (ok) {
      setQzStatus("connected");
      const found = await listPrinters();
      setUsbPrinters(found);
      return true;
    } else {
      setQzStatus("disconnected");
      return false;
    }
  }

  function updateConfig(partial: Partial<PrinterConfig>) {
    setPrinterConfig((prev) => {
      const next = { ...prev, ...partial };
      savePrinterConfig(next);
      return next;
    });
  }

  async function handleSetMode(mode: PrintMode) {
    updateConfig({ mode });
    if (mode === "usb" || mode === "network") {
      await tryConnectQz();
    }
  }

  const [printing, setPrinting] = useState(false);

  async function handleIssue() {
    setIssuing(true);
    setIssueSuccess(null);
    setLastReceipt(null);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, phone: phone || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setIssueSuccess(data.displayNumber);

        const receipt: ReceiptData = {
          tokenNumber: data.displayNumber,
          name: name || undefined,
          levelName: data.levelName ?? "Document Verification",
          queuePosition: data.queuePosition ?? 1,
          issuedAt: new Date(data.createdAt),
        };
        setLastReceipt(receipt);
        setName("");
        setPhone("");
        fetchData();

        await handlePrint(receipt);

        setTimeout(() => {
          setIssueSuccess(null);
          setLastReceipt(null);
        }, 5000);
      }
    } finally {
      setIssuing(false);
    }
  }

  async function handlePrint(data: ReceiptData) {
    if (printing) return;
    setPrinting(true);
    setPrintError(null);
    try {
      await doPrint(data, printerConfig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Print failed";
      setPrintError(msg);
      if (printerConfig.mode !== "browser") {
        printViaBrowser(data);
      }
    } finally {
      setPrinting(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`/api/tokens?search=${encodeURIComponent(searchQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResult(data.token ?? null);
        setReactivateSuccess(null);
      }
    } catch { /* */ }
  }

  async function handleReactivate(tokenId: number) {
    setReactivating(true);
    try {
      const res = await fetch(`/api/tokens/${tokenId}/reactivate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: reactivateMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setReactivateSuccess(data.message);
        setSearchResult(null);
        fetchData();
        setTimeout(() => setReactivateSuccess(null), 4000);
      }
    } finally {
      setReactivating(false);
    }
  }

  const stateBadge = (state: string) => {
    const map: Record<string, string> = {
      WAITING: "bg-teal-light text-teal border border-teal-border",
      CALLED: "bg-amber-bg text-amber border border-amber-border",
      IN_PROGRESS: "bg-teal-light text-teal border border-teal-border",
      APPROVED: "bg-teal-light text-green border border-teal-border",
      HOLD: "bg-amber-bg text-amber border border-amber-border",
      COMPLETED: "bg-paper-dark text-muted border border-border",
      NO_SHOW: "bg-red-bg text-red border border-red-border",
      DEACTIVATED: "bg-paper-dark text-muted-light border border-border",
      CANCELLED: "bg-paper-dark text-muted-light border border-border",
    };
    return map[state] ?? "bg-paper-dark text-muted border border-border";
  };

  return (
    <div className="min-h-screen bg-paper">
      {/* Top Nav */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-paper">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-dark hover:bg-paper-warm transition-colors -ml-1"
            aria-label="Back to home"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 15l-5-5 5-5"/></svg>
          </Link>
          <div>
            <div className="text-[17px] font-extrabold text-dark">Reception Desk</div>
            <div className="text-xs text-muted">Issue &amp; reactivate tokens</div>
          </div>
        </div>
        <span className="flex items-center gap-2 text-xs font-bold text-green bg-teal-light border border-teal-border px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-green" />
          Session active
        </span>
      </div>

      <div className="p-5 max-w-5xl mx-auto">
        {/* Issue + Reactivate Row */}
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          {/* Issue Card */}
          <div className="flex-1 bg-teal rounded-xl p-5 text-teal-light flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold tracking-[0.12em] text-teal-muted">ISSUE NEW TOKEN</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPrinterSetup(!showPrinterSetup)}
                  className="flex items-center gap-1.5 text-[10px] text-teal-muted hover:text-white transition-colors"
                  title="Printer settings"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034V3.375" />
                  </svg>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    printerConfig.mode === "browser" ? "bg-white/50" :
                    qzStatus === "connected" ? "bg-green" :
                    qzStatus === "connecting" ? "bg-amber-button animate-pulse" : "bg-red-400"
                  }`} />
                </button>
              </div>
            </div>

            {/* Printer Setup Panel */}
            {showPrinterSetup && (
              <div className="mt-2 bg-white/10 rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-[11px]">Printer Setup</span>
                  <button onClick={() => setShowPrinterSetup(false)} className="text-teal-muted hover:text-white text-lg leading-none">&times;</button>
                </div>

                {/* Mode tabs */}
                <div className="flex gap-1 mb-3 bg-white/5 rounded-lg p-0.5">
                  {([
                    { key: "network" as PrintMode, label: "Network" },
                    { key: "usb" as PrintMode, label: "USB" },
                    { key: "browser" as PrintMode, label: "Browser" },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleSetMode(key)}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-colors ${
                        printerConfig.mode === key ? "bg-white/20 text-white" : "text-teal-muted hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* QZ Tray status bar (shared by Network & USB) */}
                {(printerConfig.mode === "network" || printerConfig.mode === "usb") && (
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        qzStatus === "connected" ? "bg-green" :
                        qzStatus === "connecting" ? "bg-amber-button animate-pulse" : "bg-red-400"
                      }`} />
                      <span className={`text-[11px] ${qzStatus === "connected" ? "text-green" : "text-teal-muted"}`}>
                        {qzStatus === "connected" ? "QZ Tray connected" :
                         qzStatus === "connecting" ? "Connecting..." : "QZ Tray not connected"}
                      </span>
                    </div>
                    {qzStatus === "disconnected" && (
                      <button
                        onClick={tryConnectQz}
                        className="text-[10px] bg-white/15 text-white font-bold px-2.5 py-1 rounded hover:bg-white/25 transition-colors"
                      >
                        Connect
                      </button>
                    )}
                    {qzStatus === "connecting" && (
                      <svg className="animate-spin h-3.5 w-3.5 text-teal-muted" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    )}
                  </div>
                )}

                {/* Network config */}
                {printerConfig.mode === "network" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-teal-muted block mb-0.5">Printer IP</label>
                        <input
                          type="text"
                          placeholder="192.168.1.207"
                          value={networkHost}
                          onChange={(e) => {
                            setNetworkHost(e.target.value);
                            updateConfig({ networkHost: e.target.value });
                          }}
                          className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-[11px] font-mono outline-none focus:border-white/40"
                        />
                      </div>
                      <div className="w-20">
                        <label className="text-[10px] text-teal-muted block mb-0.5">Port</label>
                        <input
                          type="text"
                          placeholder="9100"
                          value={networkPort}
                          onChange={(e) => {
                            setNetworkPort(e.target.value);
                            updateConfig({ networkPort: Number(e.target.value) || 9100 });
                          }}
                          className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-[11px] font-mono outline-none focus:border-white/40"
                        />
                      </div>
                    </div>
                    {qzStatus === "connected" && (
                      <button
                        onClick={() => {
                          const testData: ReceiptData = {
                            tokenNumber: "TEST",
                            levelName: "Test Print",
                            queuePosition: 0,
                            issuedAt: new Date(),
                            orgName: "Printer Test",
                          };
                          handlePrint(testData);
                        }}
                        className="w-full bg-white/10 text-white font-bold py-1.5 rounded text-[11px] hover:bg-white/20 transition-colors"
                      >
                        Test Print
                      </button>
                    )}
                    <div className="text-[10px] text-teal-muted">
                      Sends raw ESC/POS to a network printer via <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">QZ Tray</a> (must be running on this computer)
                    </div>
                  </div>
                )}

                {/* USB config */}
                {printerConfig.mode === "usb" && (
                  <div className="space-y-2">
                    {qzStatus === "connected" ? (
                      <>
                        {usbPrinters.length > 0 ? (
                          <select
                            value={printerConfig.usbPrinter || ""}
                            onChange={(e) => updateConfig({ usbPrinter: e.target.value })}
                            className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-[11px] outline-none"
                          >
                            <option value="" className="text-dark">Select printer...</option>
                            {usbPrinters.map((p) => (
                              <option key={p} value={p} className="text-dark">{p}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-teal-muted text-[11px]">No USB printers found. Check that the printer is connected and has drivers installed.</div>
                        )}
                        <button
                          onClick={async () => {
                            const found = await listPrinters();
                            setUsbPrinters(found);
                          }}
                          className="text-[10px] text-teal-muted hover:text-white underline"
                        >
                          Refresh printer list
                        </button>
                      </>
                    ) : (
                      <div className="text-teal-muted text-[11px]">Connect to QZ Tray to discover USB printers.</div>
                    )}
                    <div className="text-[10px] text-teal-muted">
                      For USB/serial printers. Requires <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">QZ Tray</a> + printer drivers
                    </div>
                  </div>
                )}

                {/* Browser config */}
                {printerConfig.mode === "browser" && (
                  <div className="text-[11px] text-teal-muted space-y-1.5">
                    <p>Opens the browser print dialog. Works with any printer configured in your OS — no extra software needed.</p>
                    <p className="text-[10px]">Tip: Set your thermal printer as the default printer in your OS for faster printing.</p>
                  </div>
                )}

                {printError && (
                  <div className="mt-2 text-[11px] text-red-300 bg-red-500/10 rounded px-2 py-1.5">
                    {printError}
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-teal-muted mt-3">Next token</div>
            <div className="font-mono text-5xl font-bold text-white leading-none mt-0.5">
              {issueSuccess ?? nextToken}
            </div>
            {issueSuccess && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-green font-semibold">Issued!</span>
                {lastReceipt && (
                  <button
                    onClick={() => handlePrint(lastReceipt)}
                    disabled={printing}
                    className="text-xs bg-white/15 hover:bg-white/25 text-white px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034V3.375" />
                    </svg>
                    Reprint
                  </button>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-teal-text outline-none focus:border-white/40"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-teal-text outline-none focus:border-white/40"
              />
            </div>
            <div className="flex-1" />
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleIssue}
                disabled={issuing}
                className="flex-1 bg-amber-button text-dark font-extrabold text-sm text-center py-3 rounded-lg tracking-wide hover:brightness-95 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {issuing ? (
                  <span className="inline-flex items-center gap-2 justify-center">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    ISSUING...
                  </span>
                ) : "ISSUE TOKEN"}
              </button>
              {lastReceipt && (
                <button
                  onClick={() => handlePrint(lastReceipt)}
                  disabled={printing}
                  className="bg-white/15 text-white font-bold text-sm px-4 py-3 rounded-lg hover:bg-white/25 transition-colors disabled:opacity-50"
                  title="Reprint last receipt"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034V3.375" />
                  </svg>
                </button>
              )}
            </div>
            <div className="mt-2 text-[10px] text-teal-muted text-center">
              {printerConfig.mode === "network" ? `${networkHost || "Network"}:${networkPort}` :
               printerConfig.mode === "usb" ? (printerConfig.usbPrinter || "USB printer") :
               "Browser print"}
            </div>
          </div>

          {/* Reactivate Card */}
          <div className="flex-1 bg-paper-warm border border-border rounded-xl p-5 flex flex-col">
            <div className="text-[11px] font-bold tracking-[0.12em] text-muted-light">REACTIVATE TOKEN</div>
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                placeholder="T-023"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1 bg-paper-dark border border-border rounded-lg px-3 py-2.5 font-mono text-sm text-dark outline-none focus:border-teal"
              />
              <button onClick={handleSearch} className="bg-dark text-white font-bold text-sm px-4 rounded-lg hover:bg-dark/90">
                GO
              </button>
            </div>

            {reactivateSuccess && (
              <div className="mt-4 bg-teal-light border border-teal-border rounded-lg p-3 text-sm text-green font-semibold">
                {reactivateSuccess}
              </div>
            )}

            {searchResult && (
              <div className="mt-4 bg-amber-bg border border-amber-border rounded-lg p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xl font-semibold text-dark">{searchResult.displayNumber}</span>
                  <span className={`text-[11px] font-extrabold tracking-wider px-2 py-0.5 rounded ${stateBadge(searchResult.currentState)}`}>
                    {searchResult.currentState}
                  </span>
                </div>
                {searchResult.holdReason && (
                  <div className="text-xs text-muted mt-2">&ldquo;{searchResult.holdReason}&rdquo;</div>
                )}
                {searchResult.cabinName && (
                  <div className="text-xs text-muted mt-1">
                    Was at: {searchResult.cabinName}{searchResult.operatorName ? ` (${searchResult.operatorName})` : ""}
                  </div>
                )}

                {(searchResult.currentState === "HOLD" || searchResult.currentState === "DEACTIVATED") && (
                  <>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => setReactivateMode("SAME_CABIN")}
                        className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                          reactivateMode === "SAME_CABIN"
                            ? "bg-teal text-white border-teal"
                            : "bg-paper-warm text-muted border-border"
                        }`}
                      >
                        Same Counter{searchResult.operatorName ? ` (${searchResult.operatorName})` : ""}
                      </button>
                      <button
                        onClick={() => setReactivateMode("ANY_AVAILABLE")}
                        className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                          reactivateMode === "ANY_AVAILABLE"
                            ? "bg-teal text-white border-teal"
                            : "bg-paper-warm text-muted border-border"
                        }`}
                      >
                        Any Available
                      </button>
                    </div>
                    <button
                      onClick={() => handleReactivate(searchResult.id)}
                      disabled={reactivating}
                      className="mt-3 w-full bg-teal text-white font-extrabold text-sm py-3 rounded-lg hover:bg-teal/90 disabled:opacity-50"
                    >
                      {reactivating ? "REACTIVATING..." : "REACTIVATE"}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Reactivatable tokens quick list (on hold + deactivated no-shows) */}
            {reactivatableTokens.length > 0 && !searchResult && (
              <div className="mt-4">
                <div className="text-[11px] font-bold tracking-[0.1em] text-muted-light mb-2">AWAITING REACTIVATION</div>
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                  {reactivatableTokens.map((t) => (
                    <div key={t.id} className="flex items-center justify-between bg-amber-bg/50 border border-amber-border/50 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-dark">{t.displayNumber}</span>
                          <span className={`text-[9px] font-extrabold tracking-wider px-1.5 py-0.5 rounded ${stateBadge(t.currentState)}`}>
                            {t.currentState}
                          </span>
                        </div>
                        {t.reason && <span className="text-xs text-muted block truncate">{t.reason}</span>}
                      </div>
                      <button
                        onClick={() => {
                          setSearchQuery(t.displayNumber);
                          setSearchResult({
                            id: t.id,
                            displayNumber: t.displayNumber,
                            currentState: t.currentState,
                            currentLevel: t.currentLevel,
                            cabinName: t.cabinName,
                            operatorName: t.operatorName,
                            holdReason: t.reason,
                            createdAt: "",
                          });
                        }}
                        className="text-xs font-bold text-teal hover:underline shrink-0 ml-2"
                      >
                        Reactivate
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 mb-4">
          {[
            { label: "ISSUED", value: summary.issued, color: "text-dark" },
            { label: "WAITING", value: summary.waiting, color: "text-dark" },
            { label: "DONE", value: summary.completed, color: "text-green" },
            { label: "HOLD", value: summary.hold, color: "text-amber" },
            { label: "NO-SHOW", value: summary.noShow, color: "text-red" },
            { label: "COUNTERS", value: summary.activeCabins, color: "text-dark" },
          ].map((stat) => (
            <div key={stat.label} className="bg-paper-warm border border-border rounded-lg p-2.5">
              <div className={`font-mono text-[22px] font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] text-muted-light tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* All Tokens Table */}
        <div className="bg-paper-warm border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-[0.1em] text-muted-light">ALL TOKENS</span>
            <span className="text-[11px] font-mono text-muted-light">{recentTokens.length}</span>
          </div>
          <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="sticky top-0 bg-paper-warm z-10">
              <tr className="border-b border-border text-xs text-muted-light">
                <th className="text-left px-4 py-2 font-semibold">Token</th>
                <th className="text-left px-4 py-2 font-semibold">Name</th>
                <th className="text-left px-4 py-2 font-semibold">Status</th>
                <th className="text-left px-4 py-2 font-semibold">Level</th>
                <th className="text-left px-4 py-2 font-semibold">Issued</th>
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {recentTokens.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">No tokens issued yet</td></tr>
              ) : (
                recentTokens.map((token) => (
                  <tr key={token.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 font-mono font-semibold text-dark">{token.displayNumber}</td>
                    <td className="px-4 py-2 text-muted">{(token.metadata as { name?: string } | null)?.name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded ${stateBadge(token.currentState)}`}>
                        {token.currentState}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted">L{token.currentLevel}</td>
                    <td className="px-4 py-2 text-muted font-mono text-xs">
                      {new Date(token.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => handlePrint({
                          tokenNumber: token.displayNumber,
                          name: (token.metadata as { name?: string } | null)?.name,
                          levelName: `Level ${token.currentLevel}`,
                          queuePosition: 0,
                          issuedAt: new Date(token.createdAt),
                        })}
                        disabled={printing}
                        className="p-1.5 text-muted hover:text-teal rounded transition-colors disabled:opacity-30"
                        title={`Print ${token.displayNumber}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034V3.375" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
