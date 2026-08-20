import type { Candle, IndicatorSnapshot } from "./types";

const finite = (values: number[]) => values.every(Number.isFinite);

export function ema(values: number[], period: number): (number | null)[] {
  if (period <= 0 || values.length === 0 || !finite(values)) return values.map(() => null);
  const result: (number | null)[] = values.map(() => null);
  if (values.length < period) return result;
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = seed;
  const multiplier = 2 / (period + 1);
  let previous = seed;
  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    result[index] = previous;
  }
  return result;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = values.map(() => null);
  if (period <= 0 || values.length <= period || !finite(values)) return result;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

export function trueRange(candles: Candle[]): number[] {
  return candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const ranges = trueRange(candles);
  const result: (number | null)[] = ranges.map(() => null);
  if (period <= 0 || ranges.length < period) return result;
  let previous = ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = previous;
  for (let index = period; index < ranges.length; index += 1) {
    previous = (previous * (period - 1) + ranges[index]) / period;
    result[index] = previous;
  }
  return result;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const fastLine = ema(values, fast);
  const slowLine = ema(values, slow);
  const line = values.map((_, index) =>
    fastLine[index] === null || slowLine[index] === null
      ? null
      : (fastLine[index] as number) - (slowLine[index] as number),
  );
  const compact = line.filter((value): value is number => value !== null);
  const compactSignal = ema(compact, signal);
  let cursor = 0;
  const signalLine = line.map((value) => (value === null ? null : compactSignal[cursor++]));
  const histogram = line.map((value, index) =>
    value === null || signalLine[index] === null ? null : value - (signalLine[index] as number),
  );
  return { line, signal: signalLine, histogram };
}

export function vwap(candles: Candle[]): (number | null)[] {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  return candles.map((candle) => {
    if (candle.volume > 0) {
      cumulativePriceVolume += ((candle.high + candle.low + candle.close) / 3) * candle.volume;
      cumulativeVolume += candle.volume;
    }
    return cumulativeVolume === 0 ? null : cumulativePriceVolume / cumulativeVolume;
  });
}

export function bollingerBands(values: number[], period = 20, deviations = 2) {
  const middle: (number | null)[] = values.map(() => null);
  const upper: (number | null)[] = values.map(() => null);
  const lower: (number | null)[] = values.map(() => null);
  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const deviation = Math.sqrt(
      window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period,
    );
    middle[index] = mean;
    upper[index] = mean + deviations * deviation;
    lower[index] = mean - deviations * deviation;
  }
  return { middle, upper, lower };
}

const last = (values: (number | null)[]) => values.at(-1) ?? null;

export function calculateIndicators(candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((candle) => candle.close);
  const ema9Series = ema(closes, 9);
  const ema21Series = ema(closes, 21);
  const ema50Series = ema(closes, 50);
  const rsiSeries = rsi(closes);
  const macdSeries = macd(closes);
  const vwapSeries = vwap(candles);
  const atrSeries = atr(candles);
  const bands = bollingerBands(closes);
  const averageVolume = candles.length >= 20
    ? candles.slice(-20).reduce((sum, candle) => sum + candle.volume, 0) / 20
    : null;
  const currentAtr = last(atrSeries);
  const currentClose = closes.at(-1) ?? null;
  const ema21Now = last(ema21Series);
  const ema21Previous = ema21Series.at(-4) ?? null;
  return {
    ema9: last(ema9Series),
    ema21: ema21Now,
    ema50: last(ema50Series),
    ema21Slope:
      ema21Now === null || ema21Previous === null ? null : (ema21Now - ema21Previous) / 3,
    rsi: last(rsiSeries),
    macd: last(macdSeries.line),
    macdSignal: last(macdSeries.signal),
    macdHistogram: last(macdSeries.histogram),
    vwap: last(vwapSeries),
    atr: currentAtr,
    atrPercent:
      currentAtr === null || currentClose === null || currentClose === 0
        ? null
        : (currentAtr / currentClose) * 100,
    bollingerUpper: last(bands.upper),
    bollingerMiddle: last(bands.middle),
    bollingerLower: last(bands.lower),
    relativeVolume:
      averageVolume === null || averageVolume === 0
        ? null
        : (candles.at(-1)?.volume ?? 0) / averageVolume,
  };
}

