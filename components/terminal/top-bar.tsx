"use client";

import Link from "next/link";
import { Activity, Bell, CandlestickChart, Database, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useMarketStore } from "@/lib/client/market-store";
import { formatIst } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function TopBar() {
  const health = useMarketStore((state) => state.snapshot?.health);
  const transport = useMarketStore((state) => state.transportConnected);
  const [now, setNow] = useState(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);
  const state = transport ? health?.connectionState ?? "CONNECTING" : "DISCONNECTED";
  const statusClass = state === "LIVE" ? "status-live" : state === "SIMULATION" ? "status-sim" : state === "STALE" ? "status-warn" : "status-off";
  return (
    <header className="top-bar">
      <div className="flex min-w-0 items-center gap-3">
        <div className="brand-mark"><CandlestickChart size={17} /></div>
        <div><div className="brand-name">MARKET <span>PULSE</span></div><div className="brand-kicker">INTRADAY DECISION TERMINAL</div></div>
      </div>
      <div className="session-strip">
        {(["NSE", "BSE", "MCX"] as const).map((exchange) => <span key={exchange}><i className={health?.sessions[exchange] === "OPEN" ? "dot green" : "dot"} />{exchange} {health?.sessions[exchange] ?? "—"}</span>)}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden text-right lg:block"><div className="mono-value text-[12px]">{formatIst(now)}</div><div className="micro-label">INDIA STANDARD TIME</div></div>
        <Badge className={statusClass}><i className="dot pulse" />{state === "SIMULATION" ? "SIMULATION DATA" : state}</Badge>
        <span className="hidden font-mono text-[10px] text-zinc-500 xl:inline">{health?.latencyMs ?? "—"} ms · {health?.ticksPerSecond ?? 0} t/s</span>
        <Link className="icon-button" href="/diagnostics" aria-label="Diagnostics"><Activity size={15} /></Link>
        <button className="icon-button" aria-label="Alerts"><Bell size={15} /></button>
        <Link className="icon-button" href="/settings" aria-label="Settings"><Settings size={15} /></Link>
        <span className="hidden items-center gap-1 text-[10px] text-zinc-600 md:flex"><Database size={12} /> LOCAL</span>
      </div>
    </header>
  );
}
