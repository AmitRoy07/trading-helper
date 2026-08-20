import type { Candle, MarketTick, Timeframe } from "./types";

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
};

export function candleBucket(timestamp: number, timeframe: Timeframe): number {
  const duration = TIMEFRAME_MS[timeframe];
  return Math.floor(timestamp / duration) * duration;
}

export class CandleEngine {
  private readonly candles = new Map<string, Candle[]>();
  private readonly lastTickTimestamp = new Map<string, number>();

  seed(candles: Candle[]): void {
    for (const candle of candles) {
      if (!this.validCandle(candle) || candle.timestamp > Date.now()) continue;
      const key = this.key(candle.instrumentKey, candle.timeframe);
      const series = this.candles.get(key) ?? [];
      const index = series.findIndex((item) => item.timestamp === candle.timestamp);
      if (index >= 0) series[index] = candle;
      else series.push(candle);
      series.sort((left, right) => left.timestamp - right.timestamp);
      this.candles.set(key, series.slice(-600));
    }
  }

  ingest(tick: MarketTick): Candle[] {
    if (!this.validTick(tick)) return [];
    const previousTimestamp = this.lastTickTimestamp.get(tick.instrumentKey);
    if (previousTimestamp !== undefined && tick.timestamp < previousTimestamp) return [];
    if (previousTimestamp === tick.timestamp) return [];
    this.lastTickTimestamp.set(tick.instrumentKey, tick.timestamp);
    const updated: Candle[] = [];
    for (const timeframe of Object.keys(TIMEFRAME_MS) as Timeframe[]) {
      const key = this.key(tick.instrumentKey, timeframe);
      const series = this.candles.get(key) ?? [];
      const timestamp = candleBucket(tick.timestamp, timeframe);
      const current = series.at(-1);
      const previousVolume = current?.volume ?? 0;
      const volume = tick.volume === undefined ? previousVolume : Math.max(tick.volume, previousVolume);
      let candle: Candle;
      if (current?.timestamp === timestamp) {
        candle = {
          ...current,
          high: Math.max(current.high, tick.ltp),
          low: Math.min(current.low, tick.ltp),
          close: tick.ltp,
          volume,
          openInterest: tick.openInterest ?? current.openInterest,
        };
        series[series.length - 1] = candle;
      } else {
        candle = {
          instrumentKey: tick.instrumentKey,
          timeframe,
          timestamp,
          open: tick.ltp,
          high: tick.ltp,
          low: tick.ltp,
          close: tick.ltp,
          volume: tick.volume ?? 0,
          openInterest: tick.openInterest,
        };
        series.push(candle);
      }
      this.candles.set(key, series.slice(-600));
      updated.push(candle);
    }
    return updated;
  }

  get(instrumentKey: string, timeframe: Timeframe, limit = 240): Candle[] {
    return (this.candles.get(this.key(instrumentKey, timeframe)) ?? []).slice(-limit);
  }

  private key(instrumentKey: string, timeframe: Timeframe): string {
    return `${instrumentKey}:${timeframe}`;
  }

  private validTick(tick: MarketTick): boolean {
    return (
      Number.isFinite(tick.ltp) &&
      tick.ltp > 0 &&
      Number.isFinite(tick.timestamp) &&
      tick.timestamp <= Date.now() + 5_000
    );
  }

  private validCandle(candle: Candle): boolean {
    return (
      [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) &&
      candle.open > 0 &&
      candle.high >= candle.low &&
      candle.volume >= 0
    );
  }
}

