"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket-client";

type CabinStep = "idle" | "step1" | "step2" | "hold-reason" | "confirm" | "success" | "nav-confirm";

interface CabinToken {
  id: number;
  displayNumber: string;
  metadata: { name?: string } | null;
  createdAt: string;
  waitMinutes: number;
}

interface CabinInfo {
  cabinId: number;
  cabinName: string;
  levelOrder: number;
  levelName: string;
  operatorName: string;
  currentToken: CabinToken | null;
  queueDepth: number;
  stats: { processed: number; approved: number; hold: number; noShow: number };
}

interface QueueToken {
  id: number;
  displayNumber: string;
  name: string | null;
  waitMinutes: number;
  priority: number;
}

const HOLD_PRESETS = ["Missing ID", "Missing Address Proof", "Missing Photo", "Incomplete Form"];

function tokenName(token: CabinToken | null): string | null {
  return (token?.metadata as { name?: string } | null)?.name ?? null;
}

export default function CabinPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const cabinId = (session?.user as Record<string, unknown>)?.cabinId as number ?? 0;
  const { on, connected } = useSocket(`cabin:${cabinId}`);
  const [info, setInfo] = useState<CabinInfo | null>(null);
  const [step, setStep] = useState<CabinStep>("idle");
  const [holdReason, setHoldReason] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [successColor, setSuccessColor] = useState("bg-teal");
  const [loading, setLoading] = useState(false);
  const [processingTimer, setProcessingTimer] = useState(0);
  const [confirmAction, setConfirmAction] = useState<{ action: string; label: string; color: string; remarks?: string } | null>(null);
  const busyRef = useRef(false);
  const [queue, setQueue] = useState<QueueToken[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const [callingTokenId, setCallingTokenId] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const prevStepRef = useRef<CabinStep>("idle");

  const isProcessing = step !== "idle" && step !== "success" && step !== "nav-confirm";

  const fetchInfo = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const res = await fetch(`/api/cabin?cabinId=${cabinId}`);
      if (res.ok) {
        const data = await res.json();
        setInfo(data);
        setFetchError(false);
        if (!data.currentToken && step === "idle") {
          setStep("idle");
        }
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    }
  }, [cabinId, step]);

  const fetchQueue = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const res = await fetch(`/api/cabin/queue?cabinId=${cabinId}`);
      if (res.ok) {
        const data = await res.json();
        setQueue(data.tokens ?? []);
      }
    } catch { /* will retry */ }
  }, [cabinId]);

  useEffect(() => {
    if (!cabinId) return;
    fetchInfo();
    fetchQueue();
    const interval = setInterval(() => {
      fetchInfo();
      if (showQueue || step === "idle") fetchQueue();
    }, connected ? 15000 : 5000);
    return () => clearInterval(interval);
  }, [fetchInfo, fetchQueue, connected, showQueue, step, cabinId]);

  useEffect(() => {
    const unsub = on("queue:refresh", () => {
      if (!busyRef.current) {
        fetchInfo();
        fetchQueue();
      }
    });
    return () => { unsub(); };
  }, [on, fetchInfo, fetchQueue]);

  useEffect(() => {
    if (step !== "step2" && step !== "hold-reason" && step !== "confirm") {
      setProcessingTimer(0);
      return;
    }
    const interval = setInterval(() => setProcessingTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Warn before closing tab mid-process
  useEffect(() => {
    if (!isProcessing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isProcessing]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (step === "idle" && !showQueue && e.key === "Enter") {
        e.preventDefault();
        if (queue.length > 0) callNext();
      }
      if (step === "step1" && e.key.toLowerCase() === "a") {
        e.preventDefault();
        markArrived();
      }
      if (step === "step1" && e.key.toLowerCase() === "n") {
        e.preventDefault();
        requestConfirm("no-show", "Marked No-Show", "bg-red");
      }
      if (step === "confirm" && e.key === "Enter") {
        e.preventDefault();
        executeAction();
      }
      if (step === "confirm" && e.key === "Escape") {
        e.preventDefault();
        cancelConfirm();
      }
      if (step === "nav-confirm" && e.key === "Escape") {
        e.preventDefault();
        setStep(prevStepRef.current);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, showQueue, queue.length]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  async function callNext() {
    setLoading(true);
    try {
      const res = await fetch("/api/cabin/call-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabinId }),
      });
      if (res.ok) {
        setShowQueue(false);
        await fetchInfo();
        setStep("step1");
      }
    } finally {
      setLoading(false);
    }
  }

  async function callSpecific(tokenId: number) {
    setCallingTokenId(tokenId);
    try {
      const res = await fetch(`/api/cabin/call-specific/${tokenId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabinId }),
      });
      if (res.ok) {
        setShowQueue(false);
        await fetchInfo();
        setStep("step1");
      } else {
        await fetchQueue();
      }
    } finally {
      setCallingTokenId(null);
    }
  }

  async function markArrived() {
    const tokenId = info?.currentToken?.id;
    if (!tokenId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cabin/arrive/${tokenId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabinId }),
      });
      if (res.ok) {
        setStep("step2");
        setProcessingTimer(0);
        await fetchInfo();
      }
    } finally {
      setLoading(false);
    }
  }

  function requestConfirm(action: string, label: string, color: string, remarks?: string) {
    setConfirmAction({ action, label, color, remarks });
    setStep("confirm");
    busyRef.current = true;
  }

  function cancelConfirm() {
    const prev = confirmAction?.action === "no-show" ? "step1" : "step2";
    setConfirmAction(null);
    setStep(prev);
    busyRef.current = false;
  }

  async function executeAction() {
    if (!confirmAction) return;
    const tokenId = info?.currentToken?.id;
    if (!tokenId) return;
    const { action, label, color, remarks } = confirmAction;
    setLoading(true);
    busyRef.current = true;
    try {
      const res = await fetch(`/api/cabin/${action}/${tokenId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabinId, remarks }),
      });
      if (res.ok) {
        setSuccessMessage(`${info!.currentToken!.displayNumber} ${label}`);
        setSuccessColor(color);
        setConfirmAction(null);
        setStep("success");
        setHoldReason("");
        setSelectedPreset(null);
        await fetchInfo();
        await fetchQueue();
        setTimeout(() => {
          setStep("idle");
          setSuccessMessage("");
          busyRef.current = false;
        }, 2500);
      } else {
        busyRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  }

  function handleBackNav() {
    if (isProcessing) {
      prevStepRef.current = step;
      setStep("nav-confirm");
    } else {
      router.push("/");
    }
  }

  if (!cabinId) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl text-muted-light mb-3">!</div>
          <div className="text-lg font-bold text-dark mb-1">No Counter Assigned</div>
          <div className="text-sm text-muted mb-4">Your account is not linked to a counter. Contact an administrator.</div>
          <button onClick={() => router.push("/")} className="text-sm font-bold text-teal hover:underline">Go to Home</button>
        </div>
      </div>
    );
  }

  const cabinLabel = info?.cabinName ?? "Counter";
  const levelLabel = info ? `Level ${info.levelOrder}` : "Level";
  const operatorName = info?.operatorName ?? "Operator";
  const token = info?.currentToken;
  const stats = info?.stats ?? { processed: 0, approved: 0, hold: 0, noShow: 0 };

  return (
    <div className="min-h-screen bg-paper flex flex-col max-w-lg mx-auto">
      {/* Connection lost banner */}
      {fetchError && !connected && (
        <div className="bg-red-bg border-b border-red-border px-4 py-2 text-center text-xs font-semibold text-red animate-pulse">
          Connection lost — retrying...
        </div>
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-paper">
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleBackNav}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-dark hover:bg-paper-warm transition-colors -ml-1 mr-0.5"
            aria-label="Back to home"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 15l-5-5 5-5"/></svg>
          </button>
          <div className="w-8 h-8 rounded-lg bg-teal text-white flex items-center justify-center font-mono font-bold text-sm" aria-hidden="true">
            {info?.cabinName?.replace(/\D/g, "").padStart(2, "0") ?? "01"}
          </div>
          <div>
            <div className="text-[15px] font-extrabold text-dark">{cabinLabel} · {levelLabel}</div>
            <div className="text-[11px] text-muted">{info?.levelName ?? ""}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{operatorName}</span>
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-green" : "bg-red"}`}
            aria-label={connected ? "Connected" : "Disconnected"}
            title={connected ? "Connected" : "Disconnected"}
          />
        </div>
      </div>

      {/* Stats strip */}
      <div className="px-4 py-2 text-xs text-muted border-b border-border/50 bg-paper-warm">
        Today: <b className="text-dark">{stats.processed}</b> processed · Approved <b className="text-green">{stats.approved}</b> · Hold <b className="text-amber">{stats.hold}</b> · No-show <b className="text-red">{stats.noShow}</b>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col p-4">
        {/* SUCCESS OVERLAY */}
        {step === "success" && (
          <div className={`flex-1 flex flex-col items-center justify-center rounded-2xl ${successColor} text-white p-8 animate-[fadeIn_0.3s_ease-out]`}>
            <div className="text-5xl mb-4">
              {successColor === "bg-teal" ? "✓" : successColor === "bg-amber" ? "⏸" : "✕"}
            </div>
            <div className="text-xl font-extrabold text-center">{successMessage}</div>
          </div>
        )}

        {/* NAV CONFIRM — in-app dialog instead of browser confirm() */}
        {step === "nav-confirm" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full rounded-2xl border-2 border-amber-border bg-amber-bg p-8 text-center">
              <div className="text-lg font-bold text-dark mb-2">Leave this page?</div>
              <div className="text-sm text-muted mb-6">You have a token in progress. Leaving will not cancel it, but you'll need to return to continue.</div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setStep(prevStepRef.current)}
                  className="px-6 py-3 bg-paper-dark border border-border text-dark font-extrabold text-sm rounded-xl hover:bg-border transition-colors"
                >
                  Stay
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="px-6 py-3 bg-amber text-white font-extrabold text-sm rounded-xl hover:bg-amber/90 transition-colors"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRM DIALOG */}
        {step === "confirm" && confirmAction && token && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className={`w-full rounded-2xl border-2 p-8 text-center ${
              confirmAction.action === "approve" ? "border-teal bg-teal-light" :
              confirmAction.action === "hold" ? "border-amber-border bg-amber-bg" :
              confirmAction.action === "no-show" ? "border-red-border bg-red-bg" :
              "border-border bg-paper-warm"
            }`}>
              <div className="font-mono text-4xl font-bold text-dark mb-3">{token.displayNumber}</div>
              <div className="text-lg font-bold text-dark mb-1">
                {confirmAction.action === "approve" ? "Approve this token?" :
                 confirmAction.action === "hold" ? "Put on hold?" :
                 confirmAction.action === "no-show" ? "Mark as no-show?" :
                 "Skip and re-queue?"}
              </div>
              {confirmAction.remarks && (
                <div className="text-sm text-muted mt-1">Reason: {confirmAction.remarks}</div>
              )}
              <div className="flex gap-3 mt-6 justify-center">
                <button
                  onClick={cancelConfirm}
                  className="px-6 py-3 bg-paper-dark border border-border text-dark font-extrabold text-sm rounded-xl hover:bg-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeAction}
                  disabled={loading}
                  className={`px-6 py-3 text-white font-extrabold text-sm rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                    confirmAction.action === "approve" ? "bg-teal hover:bg-teal/90" :
                    confirmAction.action === "hold" ? "bg-amber hover:bg-amber/90" :
                    confirmAction.action === "no-show" ? "bg-red hover:bg-red/90" :
                    "bg-dark hover:bg-dark/90"
                  }`}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Processing...
                    </span>
                  ) : (
                    <>Confirm <span className="text-xs opacity-70 ml-1">↵</span></>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* IDLE STATE */}
        {step === "idle" && !showQueue && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-muted-light mb-2">
              <svg className="w-16 h-16 mx-auto opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <div className="text-base font-semibold text-muted-light">No token assigned</div>
            <div className="text-sm text-muted mt-1">Press below to call the next person</div>
          </div>
        )}

        {/* QUEUE LIST */}
        {step === "idle" && showQueue && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold tracking-[0.1em] text-muted-light">
                WAITING QUEUE · {queue.length} TOKEN{queue.length !== 1 ? "S" : ""}
              </span>
              <button
                onClick={() => setShowQueue(false)}
                className="text-xs font-bold text-muted hover:text-dark"
              >
                Hide
              </button>
            </div>

            {queue.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-sm text-muted">Queue is empty</div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto -mx-1">
                <div className="flex flex-col gap-2 px-1">
                  {queue.map((qt, i) => (
                    <button
                      key={qt.id}
                      onClick={() => callSpecific(qt.id)}
                      disabled={callingTokenId !== null}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.98] disabled:opacity-60 ${
                        callingTokenId === qt.id
                          ? "border-teal bg-teal-light"
                          : qt.priority > 0
                            ? "border-amber-border bg-amber-bg hover:border-amber"
                            : "border-border bg-paper-warm hover:border-teal/50"
                      }`}
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-paper-dark text-[11px] font-bold text-muted-light shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[17px] font-bold text-dark">{qt.displayNumber}</span>
                          {qt.priority > 0 && (
                            <span className="text-[9px] font-extrabold tracking-wider text-amber bg-amber-bg border border-amber-border px-1.5 py-0.5 rounded">PRIORITY</span>
                          )}
                        </div>
                        {qt.name && (
                          <div className="text-[13px] text-muted truncate">{qt.name}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-muted">{qt.waitMinutes}m</div>
                        {callingTokenId === qt.id ? (
                          <div className="text-[11px] font-bold text-teal">Calling...</div>
                        ) : (
                          <div className="text-[11px] font-bold text-teal">Call</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 1 — Person called, waiting for arrival */}
        {step === "step1" && token && (
          <div className="flex-1 flex flex-col">
            <div className="bg-paper-warm border-2 border-teal/30 rounded-2xl p-6 text-center flex-1 flex flex-col justify-center">
              <div className="text-[11px] font-bold tracking-[0.12em] text-muted-light">CURRENT TOKEN</div>
              <div className="font-mono text-6xl font-bold text-teal leading-none mt-2">{token.displayNumber}</div>
              {tokenName(token) && (
                <div className="text-base text-dark font-medium mt-2">{tokenName(token)}</div>
              )}
              <div className="flex justify-center gap-5 text-[13px] text-muted mt-3">
                <span>Issued <b className="text-dark">{new Date(token.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</b></span>
                <span>Waited <b className="text-amber">{token.waitMinutes} min</b></span>
              </div>
            </div>

            <div className="flex items-center gap-2 my-4">
              <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-teal bg-teal-light border border-teal-border px-2.5 py-1 rounded-full">
                <span className="w-4 h-4 rounded-full bg-teal text-white flex items-center justify-center text-[10px]">1</span>
                PRESENCE
              </span>
              <span className="flex-1 h-px bg-border" />
              <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-muted-light bg-paper-dark border border-border px-2.5 py-1 rounded-full">
                <span className="w-4 h-4 rounded-full bg-muted-light/40 text-white flex items-center justify-center text-[10px]">2</span>
                DECISION
              </span>
            </div>

            <div className="text-[11px] font-bold tracking-[0.1em] text-muted-light mb-2">STEP 1 · IS THE PERSON HERE?</div>
          </div>
        )}

        {/* STEP 2 — Person is here, make decision */}
        {(step === "step2" || step === "hold-reason") && token && (
          <div className="flex-1 flex flex-col">
            <div className="bg-paper-warm border border-border rounded-2xl p-6 text-center">
              <div className="text-[11px] font-bold tracking-[0.12em] text-muted-light">CURRENT TOKEN</div>
              <div className="font-mono text-5xl font-bold text-teal leading-none mt-2">{token.displayNumber}</div>
              {tokenName(token) && (
                <div className="text-base text-dark font-medium mt-2">{tokenName(token)}</div>
              )}
              <div className="flex justify-center gap-3 mt-2">
                <span className="text-[11px] font-extrabold tracking-wider text-teal bg-teal-light px-2 py-0.5 rounded">IN PROGRESS</span>
                <span className="text-[13px] text-muted font-mono">{formatTimer(processingTimer)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 my-4">
              <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-teal bg-teal-light border border-teal-border px-2.5 py-1 rounded-full">
                <span className="w-4 h-4 rounded-full bg-teal text-white flex items-center justify-center text-[10px]">1</span>
                PRESENCE
              </span>
              <span className="flex-1 h-px bg-border" />
              <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-teal bg-teal-light border border-teal-border px-2.5 py-1 rounded-full">
                <span className="w-4 h-4 rounded-full bg-teal text-white flex items-center justify-center text-[10px]">2</span>
                DECISION
              </span>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold tracking-[0.1em] text-muted-light">STEP 2 · DECISION</span>
              <button onClick={() => setStep("step1")} className="text-xs text-muted hover:text-dark">&lsaquo; back</button>
            </div>

            {/* Hold Reason Panel — inside step2 block */}
            {step === "hold-reason" && (
              <div className="bg-amber-bg border border-amber-border rounded-xl p-3.5 mt-2">
                <div className="text-[11px] font-bold tracking-wider text-amber mb-2">HOLD REASON</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {HOLD_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => { setSelectedPreset(preset); setHoldReason(preset); }}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        selectedPreset === preset
                          ? "bg-amber text-white border-amber"
                          : "bg-paper-warm text-muted border-amber-border hover:bg-amber-bg"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Or type a reason..."
                    value={holdReason}
                    onChange={(e) => { setHoldReason(e.target.value); setSelectedPreset(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && holdReason) requestConfirm("hold", "Put on Hold", "bg-amber", holdReason); }}
                    className="flex-1 bg-paper-warm border border-amber-border rounded-lg px-3 py-2.5 text-sm text-dark outline-none focus:border-amber"
                    autoFocus
                  />
                  <button
                    onClick={() => requestConfirm("hold", "Put on Hold", "bg-amber", holdReason)}
                    disabled={!holdReason}
                    className="bg-amber text-white font-extrabold text-sm px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    HOLD
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom action buttons — fixed */}
      <div className="sticky bottom-0 p-4 bg-paper border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.04)] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {step === "idle" && (
          <div className="space-y-2">
            <button
              onClick={callNext}
              disabled={loading || queue.length === 0}
              className="w-full bg-dark text-white font-extrabold text-[15px] py-4 rounded-xl tracking-wide active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  CALLING...
                </span>
              ) : (
                <>
                  CALL NEXT TOKEN
                  {info && info.queueDepth > 0 && (
                    <span className="ml-2 text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full">{info.queueDepth} waiting</span>
                  )}
                </>
              )}
            </button>
            {queue.length > 0 && (
              <button
                onClick={() => { setShowQueue(!showQueue); if (!showQueue) fetchQueue(); }}
                className="w-full bg-paper-warm border border-border text-dark font-bold text-[13px] py-3 rounded-xl active:scale-[0.98] transition-transform"
              >
                {showQueue ? "HIDE QUEUE" : `VIEW QUEUE (${queue.length})`}
              </button>
            )}
          </div>
        )}

        {step === "step1" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={markArrived}
              disabled={loading}
              className="bg-teal text-white rounded-xl py-5 text-center active:scale-[0.97] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-7 h-7 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
              <div className="text-[15px] font-extrabold">ARRIVED</div>
              <div className="text-[10px] opacity-70 mt-0.5">A</div>
            </button>
            <button
              onClick={() => requestConfirm("no-show", "Marked No-Show", "bg-red")}
              disabled={loading}
              className="bg-red-bg border border-red-border text-red rounded-xl py-5 text-center active:scale-[0.97] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-7 h-7 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
              <div className="text-[15px] font-extrabold">NO-SHOW</div>
              <div className="text-[10px] opacity-70 mt-0.5">N</div>
            </button>
          </div>
        )}

        {step === "step2" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => requestConfirm("approve", "Approved", "bg-teal")}
                disabled={loading}
                className="bg-teal text-white rounded-xl py-5 text-center active:scale-[0.97] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-7 h-7 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                <div className="text-[15px] font-extrabold">APPROVE</div>
              </button>
              <button
                onClick={() => setStep("hold-reason")}
                disabled={loading}
                className="bg-amber-bg border-[1.5px] border-amber-border text-amber rounded-xl py-5 text-center active:scale-[0.97] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-7 h-7 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" /></svg>
                <div className="text-[15px] font-extrabold">HOLD</div>
              </button>
            </div>
            <button
              onClick={() => requestConfirm("skip", "Skipped & Re-queued", "bg-dark")}
              disabled={loading}
              className="w-full bg-paper-dark border border-border text-muted rounded-xl py-3 text-center active:scale-[0.97] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-[13px] font-extrabold">SKIP & RE-QUEUE</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
