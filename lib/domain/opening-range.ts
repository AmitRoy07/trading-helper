import type { Candle } from "./types";

export type OpeningRangeState = {
  high: number | null;
  low: number | null;
  state: "FORMING" | "INSIDE" | "BREAKOUT_UP" | "BREAKOUT_DOWN" | "RETEST" | "UNAVAILABLE";
  distance: number | null;
};

export function openingRange(candles: Candle[], periodMinutes: 5 | 15 | 30): OpeningRangeState {
  if (candles.length === 0) return { high: null, low: null, state: "UNAVAILABLE", distance: null };
  const start = candles[0].timestamp;
  const end = start + periodMinutes * 60_000;
  const rangeCandles = candles.filter((candle) => candle.timestamp < end);
  const latest = candles.at(-1) as Candle;
  const high = Math.max(...rangeCandles.map((candle) => candle.high));
  const low = Math.min(...rangeCandles.map((candle) => candle.low));
  if (latest.timestamp < end) return { high, low, state: "FORMING", distance: null };
  if (latest.close > high) return { high, low, state: "BREAKOUT_UP", distance: latest.close - high };
  if (latest.close < low) return { high, low, state: "BREAKOUT_DOWN", distance: low - latest.close };
  const prior = candles.at(-2);
  const retest = prior && (prior.close > high || prior.close < low);
  return { high, low, state: retest ? "RETEST" : "INSIDE", distance: Math.min(high - latest.close, latest.close - low) };
}

