import type { Candle, StructureLabel } from "./types";

export type Swing = { index: number; timestamp: number; price: number; kind: "HIGH" | "LOW" };

export function detectSwings(candles: Candle[], lookback = 2): Swing[] {
  if (candles.length < lookback * 2 + 1) return [];
  const swings: Swing[] = [];
  for (let index = lookback; index < candles.length - lookback; index += 1) {
    const candle = candles[index];
    const window = candles.slice(index - lookback, index + lookback + 1);
    if (window.every((item, windowIndex) => windowIndex === lookback || candle.high > item.high)) {
      swings.push({ index, timestamp: candle.timestamp, price: candle.high, kind: "HIGH" });
    }
    if (window.every((item, windowIndex) => windowIndex === lookback || candle.low < item.low)) {
      swings.push({ index, timestamp: candle.timestamp, price: candle.low, kind: "LOW" });
    }
  }
  return swings;
}

export function detectMarketStructure(candles: Candle[]): StructureLabel {
  const swings = detectSwings(candles, 2);
  const highs = swings.filter((swing) => swing.kind === "HIGH").slice(-2);
  const lows = swings.filter((swing) => swing.kind === "LOW").slice(-2);
  const close = candles.at(-1)?.close;
  if (close === undefined || highs.length < 2 || lows.length < 2) return "MIXED";
  const [previousHigh, latestHigh] = highs;
  const [previousLow, latestLow] = lows;
  if (close > latestHigh.price) return "BULLISH BOS";
  if (close < latestLow.price) return "BEARISH BOS";
  const higherHigh = latestHigh.price > previousHigh.price;
  const higherLow = latestLow.price > previousLow.price;
  const lowerHigh = latestHigh.price < previousHigh.price;
  const lowerLow = latestLow.price < previousLow.price;
  if (higherHigh && higherLow) return "HIGHER HIGH / HIGHER LOW";
  if (lowerHigh && lowerLow) return "LOWER HIGH / LOWER LOW";
  const recent = candles.slice(-12);
  const totalRange = Math.max(...recent.map((candle) => candle.high)) - Math.min(...recent.map((candle) => candle.low));
  const averageRange = recent.reduce((sum, candle) => sum + candle.high - candle.low, 0) / Math.max(recent.length, 1);
  if (totalRange <= averageRange * 3) return "CONSOLIDATION";
  if (higherHigh && lowerLow) return "CHANGE OF CHARACTER";
  return "MIXED";
}

