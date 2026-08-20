import { ArrowRight, CheckCircle2, Circle, Crosshair, Eye, ShieldX } from "lucide-react";
import type { SetupLifecycle, SetupStage } from "@/lib/domain/types";
import { cn, formatPrice } from "@/lib/utils";
import { Panel, PanelTitle } from "@/components/ui/panel";

const LONG_STAGES: SetupStage[] = ["NO SETUP", "WATCHING LONG", "LONG READY", "LONG ACTIVE"];
const SHORT_STAGES: SetupStage[] = ["NO SETUP", "WATCHING SHORT", "SHORT READY", "SHORT ACTIVE"];

export function SetupLifecyclePanel({ lifecycle }: { lifecycle: SetupLifecycle | null }) {
  const stage = lifecycle?.stage ?? "NO SETUP";
  return <Panel className="setup-lifecycle-panel">
    <div className="panel-heading"><PanelTitle>LIVE SETUP LIFECYCLE</PanelTitle><span className="lifecycle-live"><i /> TICK DRIVEN</span></div>
    <div className="lifecycle-current">
      <span>CURRENT STATE</span>
      <strong className={cn(stage.includes("LONG") && "bullish-text", stage.includes("SHORT") && "bearish-text", stage === "TARGET HIT" && "bullish-text", stage === "INVALIDATED" && "bearish-text")}>{stage}</strong>
      <p>{lifecycle?.note ?? "Waiting for live market data and directional confluence"}</p>
    </div>
    <LifecycleRail label="LONG PATH" stages={LONG_STAGES} current={stage} tone="long" />
    <LifecycleRail label="SHORT PATH" stages={SHORT_STAGES} current={stage} tone="short" />
    <div className="terminal-outcomes">
      <Outcome label="TARGET HIT" active={stage === "TARGET HIT"} icon={<CheckCircle2 size={13} />} />
      <Outcome label="INVALIDATED" active={stage === "INVALIDATED"} icon={<ShieldX size={13} />} />
    </div>
    {lifecycle?.plan && <div className="lifecycle-levels"><span>ENTRY <b>{formatPrice(lifecycle.plan.entryLow)}–{formatPrice(lifecycle.plan.entryHigh)}</b></span><span>STOP <b>{formatPrice(lifecycle.plan.invalidation)}</b></span><span>T1 <b>{formatPrice(lifecycle.plan.target1)}</b></span></div>}
  </Panel>;
}

function LifecycleRail({ label, stages, current, tone }: { label: string; stages: SetupStage[]; current: SetupStage; tone: "long" | "short" }) {
  return <div className={cn("lifecycle-rail", tone)}><div className="lifecycle-label">{label}</div><div className="lifecycle-stages">{stages.map((stage, index) => <div key={stage} className={cn("lifecycle-stage", current === stage && "active")}><span>{index === 0 ? <Circle size={11} /> : index === 1 ? <Eye size={11} /> : index === 2 ? <Crosshair size={11} /> : <Circle size={11} fill="currentColor" />}</span><b>{stage}</b>{index < stages.length - 1 && <ArrowRight className="stage-arrow" size={11} />}</div>)}</div></div>;
}

function Outcome({ label, active, icon }: { label: string; active: boolean; icon: React.ReactNode }) {
  return <span className={cn(active && "active")}>{icon}{label}</span>;
}

