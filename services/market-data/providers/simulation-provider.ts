import type { Candle, MarketInstrument, MarketTick, Timeframe } from "@/lib/domain/types";
import { TIMEFRAME_MS } from "@/lib/domain/candle-engine";
import { unavailablePutCallRatio } from "@/lib/domain/put-call-ratio";
import type { InstrumentQuery, MarketDataProvider } from "./market-data-provider";

type SimState = { instrument: MarketInstrument; price: number; previousClose: number; volume: number; oi?: number; seed: number; phase: number };

export class SimulationMarketDataProvider implements MarketDataProvider {
  readonly name = "simulation" as const;
  private timer: NodeJS.Timeout | null = null;
  private states = new Map<string, SimState>();
  private readonly tickListeners = new Set<(tick: MarketTick) => void>();
  private readonly statusListeners = new Set<(status: string, message?: string) => void>();

  async connect() { this.statusListeners.forEach((listener) => listener("SIMULATION", "Deterministic seeded development feed")); }
  async disconnect() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async subscribe(instruments: MarketInstrument[]) {
    const bases: Record<string, number> = { GOLDM: 101_850, NIFTY: 24_960, SENSEX: 81_720 };
    instruments.forEach((instrument, index) => this.states.set(instrument.instrumentKey, { instrument, price: bases[instrument.symbol] ?? 10_000, previousClose: (bases[instrument.symbol] ?? 10_000) * 0.9975, volume: index * 1500, oi: instrument.symbol === "GOLDM" ? 18_420 : undefined, seed: 11 + index * 97, phase: index * 1.7 }));
    if (!this.timer) this.timer = setInterval(() => this.emitTicks(), 500);
  }
  async unsubscribe(instruments: MarketInstrument[]) { instruments.forEach((instrument) => this.states.delete(instrument.instrumentKey)); }

  async getQuote(instrument: MarketInstrument) {
    const state = this.states.get(instrument.instrumentKey);
    if (!state) throw new Error("Instrument is not subscribed in simulation");
    return this.tick(state);
  }

  async getHistoricalCandles(instrument: MarketInstrument, timeframe: Timeframe, from: Date, to: Date): Promise<Candle[]> {
    const base = { GOLDM: 101_850, NIFTY: 24_960, SENSEX: 81_720 }[instrument.symbol] ?? 10_000;
    const duration = TIMEFRAME_MS[timeframe];
    const count = Math.min(240, Math.max(1, Math.floor((to.getTime() - from.getTime()) / duration)));
    const end = Math.floor(to.getTime() / duration) * duration - duration;
    let previous = base * 0.985;
    return Array.from({ length: count }, (_, index) => {
      const timestamp = end - (count - index - 1) * duration;
      const wave = Math.sin(index / 8 + instrument.exchangeToken.length) * base * 0.00065;
      const drift = base * 0.00008;
      const close = previous + wave * 0.17 + drift;
      const spread = base * (0.00035 + ((index * 17) % 10) / 20_000);
      const candle: Candle = { instrumentKey: instrument.instrumentKey, timeframe, timestamp, open: previous, high: Math.max(previous, close) + spread, low: Math.min(previous, close) - spread * 0.85, close, volume: 800 + ((index * 137) % 2200), openInterest: instrument.symbol === "GOLDM" ? 18_000 + index * 3 : undefined };
      previous = close;
      return candle;
    });
  }

  async searchInstruments(query: InstrumentQuery) {
    const needle = query.query.toUpperCase();
    return [...this.states.values()].map((state) => state.instrument).filter((instrument) => `${instrument.symbol} ${instrument.displayName}`.toUpperCase().includes(needle));
  }
  async getPutCallRatio() { return unavailablePutCallRatio(); }
  onTick(listener: (tick: MarketTick) => void) { this.tickListeners.add(listener); return () => this.tickListeners.delete(listener); }
  onStatus(listener: (status: string, message?: string) => void) { this.statusListeners.add(listener); return () => this.statusListeners.delete(listener); }

  private emitTicks() {
    for (const state of this.states.values()) this.tickListeners.forEach((listener) => listener(this.tick(state)));
  }
  private tick(state: SimState): MarketTick {
    state.seed = (state.seed * 1_664_525 + 1_013_904_223) >>> 0;
    state.phase += 0.09;
    const random = state.seed / 0xffff_ffff - 0.5;
    const scale = state.price * (state.instrument.symbol === "GOLDM" ? 0.000045 : 0.000025);
    state.price = Math.max(1, state.price + Math.sin(state.phase) * scale * 0.25 + random * scale);
    state.volume += 15 + (state.seed % 80);
    if (state.oi !== undefined) state.oi += (state.seed % 5) - 2;
    return { instrumentKey: state.instrument.instrumentKey, symbol: state.instrument.symbol, exchange: state.instrument.exchange, ltp: state.price, timestamp: Date.now(), previousClose: state.previousClose, open: state.previousClose * 1.001, high: Math.max(state.price, state.previousClose * 1.004), low: Math.min(state.price, state.previousClose * 0.996), volume: state.volume, openInterest: state.oi, bid: state.price - scale * 0.15, ask: state.price + scale * 0.15 };
  }
}
