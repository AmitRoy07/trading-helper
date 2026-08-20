"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { useMarketStore } from "@/lib/client/market-store";
import { Button } from "@/components/ui/button";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { SubpageShell } from "./subpage-shell";

type Settings = { defaultInstrument: "GOLDM" | "NIFTY" | "SENSEX"; defaultTimeframe: string; minimumRiskReward: number; soundEnabled: boolean; browserNotifications: boolean; indicatorToggles: Record<string, boolean> };
const defaults: Settings = { defaultInstrument: "GOLDM", defaultTimeframe: "5m", minimumRiskReward: 1.5, soundEnabled: false, browserNotifications: false, indicatorToggles: { ema9: true, ema21: true, ema50: true, vwap: true, levels: true } };

export function SettingsScreen() {
  const [settings, setSettings] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const health = useMarketStore((state) => state.snapshot?.health);
  const snapshot = useMarketStore((state) => state.snapshot);
  useEffect(() => { fetch("http://127.0.0.1:8787/settings").then((response) => response.json()).then(setSettings).catch(() => undefined); }, []);
  const save = async () => { const response = await fetch("http://127.0.0.1:8787/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }); if (response.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); } };
  return <SubpageShell eyebrow="LOCAL CONFIGURATION" title="Terminal settings">
    <div className="settings-grid">
      <Panel><div className="panel-heading"><PanelTitle>DATA PROVIDER</PanelTitle><span className="micro-label">SERVER-SIDE CREDENTIALS</span></div><div className="form-body"><Field label="PROVIDER"><div className="readout">{health?.provider?.toUpperCase() ?? "SERVICE OFFLINE"}</div></Field><Field label="CONNECTION STATE"><div className="readout">{health?.connectionState ?? "DISCONNECTED"}</div></Field><Field label="UPSTOX TOKEN"><div className="readout">{health?.tokenConfigured ? "CONFIGURED ·••••••••" : "NOT CONFIGURED"}</div></Field><p className="form-note">The token is read only by the Node market-data service. It is never returned by this API or bundled into browser JavaScript.</p><Button onClick={() => fetch("http://127.0.0.1:8787/reconnect", { method: "POST" })}><RefreshCw size={12} /> TEST / RECONNECT</Button></div></Panel>
      <Panel><div className="panel-heading"><PanelTitle>TRADING ASSISTANT</PanelTitle><span className="micro-label">ANALYSIS ONLY</span></div><div className="form-body"><Field label="DEFAULT INSTRUMENT"><select value={settings.defaultInstrument} onChange={(event) => setSettings({ ...settings, defaultInstrument: event.target.value as Settings["defaultInstrument"] })}><option>GOLDM</option><option>NIFTY</option><option>SENSEX</option></select></Field><Field label="DEFAULT TIMEFRAME"><select value={settings.defaultTimeframe} onChange={(event) => setSettings({ ...settings, defaultTimeframe: event.target.value })}>{["1m","3m","5m","15m","30m","1h"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="MINIMUM RISK : REWARD"><input type="number" min="1" max="10" step="0.1" value={settings.minimumRiskReward} onChange={(event) => setSettings({ ...settings, minimumRiskReward: Number(event.target.value) })} /></Field></div></Panel>
      <Panel><div className="panel-heading"><PanelTitle>INDICATORS & ALERTS</PanelTitle><span className="micro-label">LOCAL PREFERENCES</span></div><div className="form-body toggle-list">{Object.entries(settings.indicatorToggles).map(([key, enabled]) => <Toggle key={key} label={key.toUpperCase()} enabled={enabled} set={(value) => setSettings({ ...settings, indicatorToggles: { ...settings.indicatorToggles, [key]: value } })} />)}<Toggle label="BROWSER NOTIFICATIONS" enabled={settings.browserNotifications} set={async (value) => { if (value && Notification.permission === "default") await Notification.requestPermission(); setSettings({ ...settings, browserNotifications: value }); }} /><Toggle label="ALERT SOUND" enabled={settings.soundEnabled} set={(value) => setSettings({ ...settings, soundEnabled: value })} /></div></Panel>
      <Panel><div className="panel-heading"><PanelTitle>GOLDM CONTRACT</PanelTitle><span className="micro-label">DYNAMIC RESOLUTION</span></div><div className="form-body"><Field label="SELECTED CONTRACT"><div className="readout">{health?.selectedGoldm?.displayName ?? "NOT RESOLVED"}</div></Field><Field label="AVAILABLE EXPIRIES"><select value={health?.selectedGoldm?.instrumentKey ?? ""} onChange={(event) => fetch("http://127.0.0.1:8787/goldm/select", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ instrumentKey: event.target.value }) })}>{snapshot?.goldmContracts.map((contract) => <option key={contract.instrumentKey} value={contract.instrumentKey}>{contract.displayName}</option>)}</select></Field><p className="form-note">Nearest unexpired contract is selected automatically unless a saved manual contract remains valid.</p></div></Panel>
    </div><div className="settings-actions"><Button className="save-button" onClick={save}>{saved ? <Check size={13} /> : null}{saved ? "SAVED" : "SAVE SETTINGS"}</Button></div>
  </SubpageShell>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="form-field"><span>{label}</span>{children}</label>; }
function Toggle({ label, enabled, set }: { label: string; enabled: boolean; set: (value: boolean) => void }) { return <label className="toggle-row"><span>{label}</span><button type="button" className={enabled ? "toggle active" : "toggle"} onClick={() => set(!enabled)}><i /></button></label>; }

