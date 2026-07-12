"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSocket } from "@/lib/socket-client";

interface ServingToken {
  id: number;
  displayNumber: string;
  cabinName: string;
  state: "CALLED" | "IN_PROGRESS";
}

interface LevelQueue {
  levelId: number;
  levelName: string;
  levelLabel: string;
  servingCount: number;
  serving: ServingToken[];
  waiting: string[];
}

interface DisplayData {
  levels: LevelQueue[];
  announcement: string | null;
}

export default function DisplayPage() {
  const [data, setData] = useState<DisplayData | null>(null);
  const [time, setTime] = useState(new Date());
  const { on, connected } = useSocket("display");
  const announcementRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/display");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // Will retry
    }
  }, []);

  // Initial fetch + fallback polling (slower when socket is connected)
  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, connected ? 15000 : 3000);
    return () => clearInterval(interval);
  }, [fetchQueue, connected]);

  // Socket.IO: instant refresh on any token change
  useEffect(() => {
    const unsub1 = on("queue:refresh", () => {
      fetchQueue();
    });
    const unsub2 = on("token:called", (payload: unknown) => {
      const p = payload as { tokenNumber: string; cabinName: string; level: number };
      announcementRef.current = `${p.tokenNumber}, please proceed to Level ${p.level}, Cabin ${p.cabinName}`;
      // Trigger TTS
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(
          `Token ${p.tokenNumber}, please proceed to Level ${p.level}, Cabin ${p.cabinName}`
        );
        utterance.rate = 0.9;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      }
      fetchQueue();
    });
    return () => { unsub1(); unsub2(); };
  }, [on, fetchQueue]);

  const timeStr = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = time.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  const levels = data?.levels ?? [];

  return (
    <div className="h-screen w-screen bg-paper flex flex-col overflow-hidden" style={{ fontFamily: "var(--font-sans)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-10 py-3.5 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-teal flex items-center justify-center text-paper font-extrabold text-lg">
            Q
          </div>
          <div>
            <div className="text-[22px] font-extrabold text-dark tracking-tight">Token Queue Display</div>
            <div className="text-[13px] text-muted mt-0.5">Service Centre</div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="font-mono text-[26px] font-semibold text-dark">{timeStr}</div>
            <div className="text-xs text-muted tracking-wider">{dateStr}</div>
          </div>
          <div className="flex items-center gap-2 bg-teal-light border border-teal-border px-3 py-1.5 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-green animate-[pulseDot_1.8s_infinite]" />
            <span className="text-xs font-bold text-green tracking-wider">LIVE</span>
          </div>
        </div>
      </div>

      {/* Queue Columns */}
      <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${Math.max(levels.length, 2)}, 1fr)` }}>
        {levels.length === 0 ? (
          <>
            <LevelColumn
              levelLabel="LEVEL 1"
              levelName="Document Verification"
              servingCount={0}
              serving={[]}
              waiting={[]}
            />
            <LevelColumn
              levelLabel="LEVEL 2"
              levelName="Final Approval"
              servingCount={0}
              serving={[]}
              waiting={[]}
              isLast
            />
          </>
        ) : (
          levels.map((level, i) => (
            <LevelColumn
              key={level.levelId}
              levelLabel={level.levelLabel}
              levelName={level.levelName}
              servingCount={level.servingCount}
              serving={level.serving}
              waiting={level.waiting}
              isLast={i === levels.length - 1}
            />
          ))
        )}
      </div>

      {/* Audio announcement bar */}
      <div className="px-10 py-3 bg-teal flex items-center gap-4">
        <span className="text-xl">🔊</span>
        <span className="font-mono text-[17px] font-medium text-teal-light tracking-tight">
          {data?.announcement ? (
            <>Token <b className="text-white">{data.announcement.split(",")[0]}</b>{data.announcement.substring(data.announcement.indexOf(","))}</>
          ) : (
            <span className="text-teal-muted">Waiting for next token call...</span>
          )}
        </span>
      </div>
    </div>
  );
}

function LevelColumn({
  levelLabel,
  levelName,
  servingCount,
  serving,
  waiting,
  isLast = false,
}: {
  levelLabel: string;
  levelName: string;
  servingCount: number;
  serving: ServingToken[];
  waiting: string[];
  isLast?: boolean;
}) {
  return (
    <div className={`px-7 py-4 flex flex-col ${!isLast ? "border-r border-border" : ""}`}>
      <div className="flex items-baseline justify-between mb-2.5">
        <div>
          <div className="text-[13px] font-extrabold tracking-[0.14em] text-teal">{levelLabel}</div>
          <div className="text-[17px] font-bold text-dark">{levelName}</div>
        </div>
        <div className="font-mono text-xs text-muted">{servingCount} serving</div>
      </div>

      <div className="text-[11px] font-bold tracking-[0.12em] text-muted-light mb-2.5">NOW SERVING</div>

      <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto">
        {serving.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-light text-sm">No tokens being served</div>
        ) : (
          serving.map((token) => (
            <div
              key={token.id}
              className={`flex items-center justify-between rounded-lg px-4 py-2 ${
                token.state === "CALLED"
                  ? "bg-amber-bg border-[1.5px] border-amber-border animate-[blinkCall_1.1s_infinite]"
                  : "bg-paper-warm border border-border"
              }`}
            >
              <span className="font-mono text-2xl font-semibold text-dark">{token.displayNumber}</span>
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] text-muted">Cabin</span>
                <span className={`font-mono text-[22px] font-bold ${token.state === "CALLED" ? "text-amber" : "text-teal"}`}>
                  {token.cabinName}
                </span>
                {token.state === "CALLED" ? (
                  <span className="text-[11px] font-extrabold text-amber tracking-wider">NOW</span>
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-green" />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-5 mt-4 pt-3.5 border-t border-border">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green" />
          <span className="text-xs text-muted">Please proceed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber" />
          <span className="text-xs text-muted">Just called</span>
        </div>
      </div>
    </div>
  );
}
