import type { Candle, PriceLevel } from "./types";
import { detectSwings } from "./structure";

type Candidate = Omit<PriceLevel, "strength">;

export function clusterLevels(
  candidates: Candidate[],
  atr: number | null,
  mergeAtrFraction = 0.3,
): PriceLevel[] {
  if (candidates.length === 0) return [];
  const threshold = Math.max((atr ?? 0) * mergeAtrFraction, Number.EPSILON);
  const sorted = [...candidates].sort((left, right) => left.price - right.price);
  const clusters: Candidate[][] = [];
  for (const candidate of sorted) {
    const cluster = clusters.at(-1);
    const mean = cluster
      ? cluster.reduce((sum, level) => sum + level.price, 0) / cluster.length
      : 0;
    if (cluster && Math.abs(candidate.price - mean) <= threshold) cluster.push(candidate);
    else clusters.push([candidate]);
  }
  return clusters.map((cluster) => {
    const touches = cluster.reduce((sum, level) => sum + level.touches, 0);
    const price = cluster.reduce((sum, level) => sum + level.price * level.touches, 0) / Math.max(touches, 1);
    const supportCount = cluster.filter((level) => level.type === "SUPPORT").length;
    const resistanceCount = cluster.filter((level) => level.type === "RESISTANCE").length;
    return {
      price,
      type: supportCount === resistanceCount ? "REFERENCE" : supportCount > resistanceCount ? "SUPPORT" : "RESISTANCE",
      touches,
      strength: Math.min(10, touches + new Set(cluster.flatMap((level) => level.source)).size),
      source: [...new Set(cluster.flatMap((level) => level.source))],
    };
  });
}

export function deriveLevels(candles: Candle[], atr: number | null): PriceLevel[] {
  if (candles.length === 0) return [];
  const current = candles.at(-1) as Candle;
  const candidates: Candidate[] = detectSwings(candles, 2).slice(-16).map((swing) => ({
    price: swing.price,
    type: swing.kind === "HIGH" ? "RESISTANCE" : "SUPPORT",
    touches: 1,
    source: [swing.kind === "HIGH" ? "Swing high" : "Swing low"],
  }));
  const opening = candles[0];
  candidates.push(
    { price: opening.open, type: "REFERENCE", touches: 1, source: ["Session open"] },
    { price: Math.max(...candles.map((candle) => candle.high)), type: "RESISTANCE", touches: 1, source: ["Session high"] },
    { price: Math.min(...candles.map((candle) => candle.low)), type: "SUPPORT", touches: 1, source: ["Session low"] },
  );
  const roundStep = current.close > 50_000 ? 500 : current.close > 10_000 ? 100 : 50;
  candidates.push({
    price: Math.round(current.close / roundStep) * roundStep,
    type: "REFERENCE",
    touches: 1,
    source: ["Round number"],
  });
  return clusterLevels(candidates, atr).sort((left, right) => right.strength - left.strength).slice(0, 10);
}

