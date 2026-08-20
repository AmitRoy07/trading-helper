import { Check, Minus, X } from "lucide-react";
import type { MarketAnalysis } from "@/lib/domain/types";
import { cn, formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelTitle } from "@/components/ui/panel";

export function AnalysisPanel({ analysis }: { analysis: MarketAnalysis }) {
  const signalClass = analysis.signal.direction.includes("LONG") ? "bullish-text" : analysis.signal.direction.includes("SHORT") ? "bearish-text" : "wait-text";
  return (
    <Panel className="analysis-panel">
      <div className="panel-heading"><PanelTitle>MARKET ANALYSIS</PanelTitle><Badge className="border-white/10 text-zinc-400">RULE BASED</Badge></div>
      <div className="signal-hero"><span className="micro-label">CURRENT ASSESSMENT</span><strong className={signalClass}>{analysis.signal.direction}</strong><div className="score-track"><i style={{ width: `${Math.min(100, Math.abs(analysis.signal.score) * 10)}%` }} /></div><div className="flex justify-between font-mono text-[10px] text-zinc-500"><span>CONFLUENCE</span><span>{analysis.signal.score} / {analysis.signal.maxScore}</span></div></div>
      <dl className="analysis-grid">
        <Metric label="TREND" value={analysis.indicators.ema9 && analysis.indicators.ema21 ? analysis.indicators.ema9 > analysis.indicators.ema21 ? "BULLISH" : "BEARISH" : "N/A"} tone={signalClass} />
        <Metric label="MOMENTUM" value={analysis.indicators.rsi ? `RSI ${analysis.indicators.rsi.toFixed(1)}` : "N/A"} />
        <Metric label="VOLATILITY" value={analysis.indicators.atr ? `ATR ${formatPrice(analysis.indicators.atr)}` : "N/A"} />
        <Metric label="STRUCTURE" value={analysis.structure} />
        <Metric label="REGIME" value={analysis.regime} />
        <Metric label="SETUP QUALITY" value={analysis.signal.quality} />
        <Metric label="OI PCR" value={formatPrice(analysis.putCallRatio.oi, 2)} />
      </dl>
      <div className="reason-list">
        <div className="micro-label mb-2">CONFLUENCE CHECKLIST</div>
        {analysis.signal.reasons.slice(0, 7).map((reason, index) => <div key={`${reason.label}-${index}`}><span className={reason.passed ? "check-pass" : "check-fail"}>{reason.passed ? <Check size={12} /> : reason.weight === 0 ? <Minus size={12} /> : <X size={12} />}</span><span>{reason.label}</span><em>{reason.weight > 0 ? "+" : ""}{reason.weight}</em></div>)}
      </div>
    </Panel>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div><dt>{label}</dt><dd className={cn(tone)}>{value}</dd></div>;
}
