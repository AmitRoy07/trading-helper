import { strategyConfig } from "@/config/strategy";
import type { IndicatorSnapshot, PriceLevel, SignalAssessment, TradePlan } from "./types";

export function buildTradePlan(
  price: number,
  indicators: IndicatorSnapshot,
  levels: PriceLevel[],
  signal: SignalAssessment,
  minimumRiskReward = strategyConfig.minimumRiskReward,
): TradePlan {
  if (signal.direction === "WAIT" || indicators.atr === null || indicators.atr <= 0) return null;
  const long = signal.direction.includes("LONG");
  const atr = indicators.atr;
  const supports = levels.filter((level) => level.price < price).map((level) => level.price);
  const resistances = levels.filter((level) => level.price > price).map((level) => level.price);
  const entryLow = long ? price - atr * 0.12 : price - atr * 0.05;
  const entryHigh = long ? price + atr * 0.05 : price + atr * 0.12;
  const nearestSupport = supports.length ? Math.max(...supports) : price - atr * 0.75;
  const nearestResistance = resistances.length ? Math.min(...resistances) : price + atr * 0.75;
  const invalidation = long
    ? Math.min(price - atr * 0.75, nearestSupport - atr * 0.08)
    : Math.max(price + atr * 0.75, nearestResistance + atr * 0.08);
  const entry = (entryLow + entryHigh) / 2;
  const risk = Math.abs(entry - invalidation);
  if (!Number.isFinite(risk) || risk <= 0) return null;
  const target1 = entry + (long ? 1 : -1) * risk * minimumRiskReward;
  const structuralTarget = long ? Math.min(...resistances, Infinity) : Math.max(...supports, -Infinity);
  const target2Candidate = entry + (long ? 1 : -1) * risk * 2.2;
  const target2 = Number.isFinite(structuralTarget)
    ? long ? Math.max(target2Candidate, structuralTarget) : Math.min(target2Candidate, structuralTarget)
    : target2Candidate;
  const riskReward = Math.abs(target1 - entry) / risk;
  if (riskReward < minimumRiskReward) return null;
  return {
    bias: signal.direction,
    entryLow,
    entryHigh,
    invalidation,
    target1,
    target2,
    riskReward,
    quality: signal.quality,
  };
}
