"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Radio, ShieldCheck } from "lucide-react";
import type { MarketAnalysis } from "@/lib/domain/types";
import { TIMEFRAMES } from "@/lib/domain/types";
import { useMarketStore } from "@/lib/client/market-store";
import { cn, formatIst, formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { AnalysisPanel } from "./analysis-panel";
import { MarketChart } from "./market-chart";
import { MarketStream } from "./market-stream";
import { MarketStrip } from "./market-strip";
import { TopBar } from "./top-bar";
import { SetupLifecyclePanel } from "./setup-lifecycle-panel";

export function TradingTerminal() {
  const snapshot = useMarketStore((state) => state.snapshot);
  const selected = useMarketStore((state) => state.selectedSymbol);
  const timeframe = useMarketStore((state) => state.timeframe);
  const setTimeframe = useMarketStore((state) => state.setTimeframe);
  const analysis = snapshot?.markets[selected];
  useSignalAlerts(analysis);
  return (
    <div className="terminal-shell">
      <MarketStream />
      <TopBar />
      <MarketStrip />
      {!snapshot && <DisconnectedState serviceOffline />}
      {snapshot && snapshot.health.message && <div className={cn("feed-banner", snapshot.health.connectionState === "SIMULATION" ? "simulation" : "warning")}><Radio size={13} />{snapshot.health.message}</div>}
      {snapshot && !analysis && <DisconnectedState serviceOffline={false} />}
      {analysis && <main className="terminal-main">
        <div className="workspace-grid">
          <Panel className="chart-panel">
            <div className="chart-toolbar">
              <div><PanelTitle>{analysis.instrument.displayName}</PanelTitle><span className="ml-3 font-mono text-[10px] text-zinc-600">{analysis.instrument.segment} · {analysis.instrument.instrumentKey}</span></div>
              <div className="timeframe-tabs">{TIMEFRAMES.map((value) => <button key={value} className={timeframe === value ? "active" : ""} onClick={() => setTimeframe(value)}>{value}</button>)}</div>
            </div>
            <div className="chart-quote"><strong>{formatPrice(analysis.tick.ltp)}</strong><span className={analysis.change >= 0 ? "positive" : "negative"}>{analysis.change >= 0 ? "+" : ""}{formatPrice(analysis.change)} ({analysis.changePercent.toFixed(2)}%)</span><span>O {formatPrice(analysis.tick.open)}</span><span>H {formatPrice(analysis.sessionHigh)}</span><span>L {formatPrice(analysis.sessionLow)}</span><span>V {analysis.tick.volume?.toLocaleString("en-IN") ?? "N/A"}</span>{selected === "GOLDM" && <span>OI {analysis.tick.openInterest?.toLocaleString("en-IN") ?? "N/A"}</span>}</div>
            <MarketChart analysis={analysis} timeframe={timeframe} />
            <div className="chart-legend"><span><i className="ema9" />EMA 9</span><span><i className="ema21" />EMA 21</span><span><i className="ema50" />EMA 50</span><span><i className="vwap" />VWAP</span></div>
          </Panel>
          <AnalysisPanel analysis={analysis} />
        </div>
        <div className="lower-grid">
          <IndicatorPanel analysis={analysis} />
          <TradePlanPanel analysis={analysis} />
        </div>
        <SetupLifecyclePanel lifecycle={analysis.setupLifecycle} />
        <CrossMarketTable markets={snapshot.markets} />
        <SignalJournal />
      </main>}
      <footer className="terminal-footer"><span><ShieldCheck size={12} /> Analysis only · No order execution capability</span><span>Market analysis is for informational and educational purposes only. It is not investment advice and does not guarantee trading outcomes.</span></footer>
    </div>
  );
}

function DisconnectedState({ serviceOffline }: { serviceOffline: boolean }) {
  return <main className="terminal-main no-data-workspace"><div className="workspace-grid">
    <Panel className="chart-panel chart-awaiting"><div className="chart-toolbar"><div><PanelTitle>LIVE MARKET CHART</PanelTitle><span className="ml-3 font-mono text-[10px] text-zinc-600">5m · AWAITING MARKET FEED</span></div><div className="timeframe-tabs">{TIMEFRAMES.map((value) => <button key={value} disabled>{value}</button>)}</div></div><div className="awaiting-chart-grid"><div className="awaiting-center"><div className="brand-mark large"><AlertTriangle size={23} /></div><h1>{serviceOffline ? "LOCAL MARKET DATA SERVICE OFFLINE" : "LIVE CHART AWAITING UPSTOX DATA"}</h1><p>{serviceOffline ? <>Start the complete workstation with <code>pnpm dev</code>.</> : <>Add the read-only token to <code>UPSTOX_ACCESS_TOKEN</code> and restart. No simulated candle is shown as live.</>}</p><div className="loading-line" /></div></div><div className="chart-legend"><span><i className="ema9" />EMA 9</span><span><i className="ema21" />EMA 21</span><span><i className="ema50" />EMA 50</span><span><i className="vwap" />VWAP</span></div></Panel>
    <SetupLifecyclePanel lifecycle={null} />
  </div></main>;
}

function IndicatorPanel({ analysis }: { analysis: MarketAnalysis }) {
  const indicators = analysis.indicators;
  const rows = [
    ["EMA 9", indicators.ema9], ["EMA 21", indicators.ema21], ["EMA 50", indicators.ema50], ["VWAP", indicators.vwap],
    ["RSI (14)", indicators.rsi], ["ATR (14)", indicators.atr], ["MACD HIST", indicators.macdHistogram], ["REL VOLUME", indicators.relativeVolume, "x"],
    ["OI PCR", analysis.putCallRatio.oi],
  ] as const;
  return <Panel><div className="panel-heading"><PanelTitle>INDICATORS & KEY LEVELS</PanelTitle><span className="micro-label">5 MINUTE BASIS</span></div><div className="indicator-grid">{rows.map(([label, value, suffix]) => <div key={label}><span>{label}</span><strong>{formatPrice(value)}{value !== null && value !== undefined ? suffix ?? "" : ""}</strong></div>)}</div><div className="level-row">{analysis.levels.slice(0, 5).map((level) => <span key={`${level.type}-${level.price}`} className={level.type === "SUPPORT" ? "support" : level.type === "RESISTANCE" ? "resistance" : "reference"}><small>{level.type}</small>{formatPrice(level.price)}<em>{level.source.join(" + ")}</em></span>)}</div></Panel>;
}

function TradePlanPanel({ analysis }: { analysis: MarketAnalysis }) {
  const plan = analysis.tradePlan;
  return <Panel><div className="panel-heading"><PanelTitle>HYPOTHETICAL TRADE PLAN</PanelTitle><Badge className="border-amber-400/20 text-amber-300">DECISION SUPPORT</Badge></div>{!plan ? <div className="no-plan"><strong>NO QUALIFIED SETUP</strong><span>Confluence or minimum 1:1.5 risk/reward requirements are not satisfied.</span></div> : <div className="trade-plan"><div className="plan-bias"><span>BIAS</span><strong className={plan.bias.includes("LONG") ? "bullish-text" : "bearish-text"}>{plan.bias}</strong></div><PlanMetric label="ENTRY ZONE" value={`${formatPrice(plan.entryLow)} – ${formatPrice(plan.entryHigh)}`} /><PlanMetric label="INVALIDATION" value={formatPrice(plan.invalidation)} tone="bearish-text" /><PlanMetric label="TARGET 1" value={formatPrice(plan.target1)} /><PlanMetric label="TARGET 2" value={formatPrice(plan.target2)} /><PlanMetric label="RISK : REWARD" value={`1 : ${plan.riskReward.toFixed(2)}`} tone="text-white" /></div>}</Panel>;
}
function PlanMetric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div className="plan-metric"><span>{label}</span><strong className={tone}>{value}</strong></div>; }

function CrossMarketTable({ markets }: { markets: Record<string, MarketAnalysis> }) {
  const symbols = ["GOLDM", "NIFTY", "SENSEX"];
  const rows: Array<[string, (analysis: MarketAnalysis) => string]> = [
    ["Trend", (a) => a.indicators.ema9 && a.indicators.ema21 ? a.indicators.ema9 > a.indicators.ema21 ? "Bullish" : "Bearish" : "N/A"],
    ["LTP", (a) => formatPrice(a.tick.ltp)], ["Change %", (a) => `${a.changePercent >= 0 ? "+" : ""}${a.changePercent.toFixed(2)}%`],
    ["RSI", (a) => formatPrice(a.indicators.rsi, 1)], ["VWAP position", (a) => a.indicators.vwap ? a.tick.ltp > a.indicators.vwap ? "Above" : "Below" : "N/A"],
    ["ATR", (a) => formatPrice(a.indicators.atr)], ["OI PCR", (a) => formatPrice(a.putCallRatio.oi, 2)], ["Structure", (a) => a.structure], ["Regime", (a) => a.regime], ["Signal", (a) => a.signal.direction], ["Score", (a) => `${a.signal.score}/10`],
  ];
  return <Panel><div className="panel-heading"><PanelTitle>CROSS-MARKET MATRIX</PanelTitle><span className="micro-label">NORMALIZED · REAL-TIME</span></div><div className="table-scroll"><table className="market-matrix"><thead><tr><th>METRIC</th>{symbols.map((symbol) => <th key={symbol}>{symbol === "NIFTY" ? "NIFTY 50" : symbol}</th>)}</tr></thead><tbody>{rows.map(([label, get]) => <tr key={label}><td>{label}</td>{symbols.map((symbol) => <td key={symbol}>{markets[symbol] ? get(markets[symbol]) : "N/A"}</td>)}</tr>)}</tbody></table></div></Panel>;
}

type JournalRow = { id: number; timestamp: number; symbol: string; timeframe: string; direction: string; confluence_score: number; setup_quality: string; price_at_signal: number; risk_reward: number | null };
function SignalJournal() {
  const [rows, setRows] = useState<JournalRow[]>([]);
  useEffect(() => { let active = true; const load = () => fetch("http://127.0.0.1:8787/signals?limit=30").then((response) => response.ok ? response.json() as Promise<JournalRow[]> : []).then((value) => { if (active) setRows(value); }).catch(() => undefined); load(); const timer = setInterval(load, 10_000); return () => { active = false; clearInterval(timer); }; }, []);
  return <Panel><div className="panel-heading"><PanelTitle>SIGNAL JOURNAL</PanelTitle><Button>VIEW ALL <ChevronRight size={12} /></Button></div><div className="table-scroll"><table className="journal-table"><thead><tr><th>TIME (IST)</th><th>INSTRUMENT</th><th>TF</th><th>ASSESSMENT</th><th>SCORE</th><th>QUALITY</th><th>PRICE</th><th>R:R</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={8} className="empty-cell">No qualified signal transitions recorded yet.</td></tr> : rows.map((row) => <tr key={row.id}><td>{formatIst(row.timestamp, true)}</td><td>{row.symbol}</td><td>{row.timeframe}</td><td className={row.direction.includes("LONG") ? "bullish-text" : "bearish-text"}>{row.direction}</td><td>{row.confluence_score}/10</td><td>{row.setup_quality}</td><td>{formatPrice(row.price_at_signal)}</td><td>{row.risk_reward?.toFixed(2) ?? "N/A"}</td></tr>)}</tbody></table></div></Panel>;
}

function useSignalAlerts(analysis: MarketAnalysis | undefined) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (!analysis || analysis.signal.direction === "WAIT" || previous.current === analysis.signal.direction) return;
    previous.current = analysis.signal.direction;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(`${analysis.instrument.symbol}: ${analysis.signal.direction}`, { body: `Confluence ${analysis.signal.score}/10 · ${analysis.signal.reasons.filter((reason) => reason.passed).slice(0, 2).map((reason) => reason.label).join(" · ")}` });
  }, [analysis]);
}
