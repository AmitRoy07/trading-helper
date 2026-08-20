"use client";

import { useMarketStore } from "@/lib/client/market-store";
import { formatIst } from "@/lib/utils";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { SubpageShell } from "./subpage-shell";

export function DiagnosticsScreen() {
  const health = useMarketStore((state) => state.snapshot?.health);
  const rows = [
    ["Provider", health?.provider?.toUpperCase()], ["WebSocket state", health?.connectionState], ["Last tick", formatIst(health?.lastTickAt)],
    ["Ticks / second", health?.ticksPerSecond], ["Feed latency", health?.latencyMs === null ? "N/A" : `${health?.latencyMs ?? "—"} ms`],
    ["Reconnect count", health?.reconnectCount], ["Subscribed instruments", health?.subscribedInstruments.length], ["Selected GOLDM", health?.selectedGoldm?.displayName],
    ["Historical API", health?.historicalApiStatus], ["Database", health?.databaseStatus], ["Application uptime", health ? `${health.uptimeSeconds}s` : "—"],
    ["Token configured", health?.tokenConfigured ? "YES (REDACTED)" : "NO"],
  ];
  return <SubpageShell eyebrow="OBSERVABILITY" title="Feed diagnostics"><Panel><div className="panel-heading"><PanelTitle>LOCAL MARKET DATA SERVICE</PanelTitle><span className="micro-label">127.0.0.1:8787</span></div><div className="diagnostic-grid">{rows.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{String(value ?? "—")}</strong></div>)}</div>{health?.message && <div className="diagnostic-message">{health.message}</div>}</Panel><Panel className="mt-3"><div className="panel-heading"><PanelTitle>ACTIVE SUBSCRIPTIONS</PanelTitle></div><div className="subscription-list">{health?.subscribedInstruments.map((key) => <code key={key}>{key}</code>) ?? <span>Local service offline</span>}</div></Panel></SubpageShell>;
}

