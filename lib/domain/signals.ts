import { strategyConfig, type StrategyConfig } from "@/config/strategy";
import type {
  IndicatorSnapshot,
  MarketRegime,
  PriceLevel,
  SetupQuality,
  SignalAssessment,
  StructureLabel,
} from "./types";

const qualityFor = (score: number): SetupQuality =>
  score >= 8 ? "VERY HIGH" : score >= 6 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW";

export function classifyRegime(
  indicators: IndicatorSnapshot,
  structure: StructureLabel,
): MarketRegime {
  if (structure === "BULLISH BOS" || structure === "BEARISH BOS") return "BREAKOUT";
  if (indicators.atrPercent !== null && indicators.atrPercent > 0.8) return "HIGH VOLATILITY";
  if (indicators.atrPercent !== null && indicators.atrPercent < 0.12) return "LOW VOLATILITY";
  if (structure === "CONSOLIDATION") return "RANGE";
  if (indicators.ema21Slope !== null && indicators.ema21 !== null && Math.abs(indicators.ema21Slope / indicators.ema21) > 0.00025) {
    return Math.abs(indicators.ema21Slope / indicators.ema21) > 0.001 ? "STRONG TREND" : "TREND";
  }
  return "UNCERTAIN";
}

export function scoreSignal(
  price: number,
  indicators: IndicatorSnapshot,
  structure: StructureLabel,
  levels: PriceLevel[],
  config: StrategyConfig = strategyConfig,
  now = Date.now(),
): SignalAssessment {
  const reasons: SignalAssessment["reasons"] = [];
  let score = 0;
  const add = (condition: boolean | null, label: string, bullish: boolean, weight: number) => {
    if (condition === null) return;
    const signed = condition ? (bullish ? weight : -weight) : 0;
    score += signed;
    reasons.push({ passed: condition, label, weight: signed });
  };
  const weights = config.weights;
  add(
    indicators.ema9 === null || indicators.ema21 === null ? null : indicators.ema9 > indicators.ema21,
    "EMA 9 above EMA 21",
    true,
    weights.emaFastAlignment,
  );
  add(
    indicators.ema21 === null || indicators.ema50 === null ? null : indicators.ema21 > indicators.ema50,
    "EMA 21 above EMA 50",
    true,
    weights.emaTrendAlignment,
  );
  if (indicators.vwap !== null) add(price > indicators.vwap, "Price above VWAP", true, weights.priceVsVwap);
  if (indicators.ema21Slope !== null) add(indicators.ema21Slope > 0, "EMA 21 slope rising", true, weights.emaSlope);
  if (indicators.rsi !== null) {
    const bullish = indicators.rsi >= 55 && indicators.rsi <= 72;
    const bearish = indicators.rsi <= 45 && indicators.rsi >= 28;
    if (bullish || bearish) {
      score += bullish ? weights.rsiMomentum : -weights.rsiMomentum;
      reasons.push({ passed: true, label: `RSI ${indicators.rsi.toFixed(1)} momentum`, weight: bullish ? weights.rsiMomentum : -weights.rsiMomentum });
    }
  }
  if (indicators.macdHistogram !== null) add(indicators.macdHistogram > 0, "MACD histogram positive", true, weights.macdMomentum);
  const bullishStructure = ["HIGHER HIGH / HIGHER LOW", "BULLISH BOS", "BREAKOUT"].includes(structure);
  const bearishStructure = ["LOWER HIGH / LOWER LOW", "BEARISH BOS"].includes(structure);
  if (bullishStructure || bearishStructure) {
    score += bullishStructure ? weights.structure : -weights.structure;
    reasons.push({ passed: true, label: structure, weight: bullishStructure ? weights.structure : -weights.structure });
  }
  if (indicators.relativeVolume !== null && indicators.relativeVolume > 1.25) {
    const direction = score >= 0 ? 1 : -1;
    score += weights.relativeVolume * direction;
    reasons.push({ passed: true, label: `Relative volume ${indicators.relativeVolume.toFixed(2)}x`, weight: weights.relativeVolume * direction });
  }
  const atr = indicators.atr ?? 0;
  const nearbyResistance = levels.some((level) => level.type === "RESISTANCE" && level.price >= price && level.price - price < atr * 0.35);
  const nearbySupport = levels.some((level) => level.type === "SUPPORT" && level.price <= price && price - level.price < atr * 0.35);
  if (score > 0 && nearbyResistance) {
    score -= weights.nearbyLevelPenalty;
    reasons.push({ passed: false, label: "Major resistance nearby", weight: -weights.nearbyLevelPenalty });
  } else if (score < 0 && nearbySupport) {
    score += weights.nearbyLevelPenalty;
    reasons.push({ passed: false, label: "Major support nearby", weight: weights.nearbyLevelPenalty });
  }
  const absolute = Math.min(10, Math.abs(score));
  const direction =
    score >= config.strongThreshold ? "STRONG LONG" :
    score >= config.directionalThreshold ? "LONG" :
    score <= -config.strongThreshold ? "STRONG SHORT" :
    score <= -config.directionalThreshold ? "SHORT" : "WAIT";
  return { direction, score: Math.round(score), maxScore: 10, quality: qualityFor(absolute), reasons, generatedAt: now };
}

