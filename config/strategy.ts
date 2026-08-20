export const strategyConfig = {
  minimumRiskReward: 1.5,
  staleAfterMs: 15_000,
  levelMergeAtrFraction: 0.3,
  swingLookback: 3,
  strongThreshold: 7,
  directionalThreshold: 3,
  weights: {
    emaFastAlignment: 1,
    emaTrendAlignment: 1,
    priceVsVwap: 1,
    emaSlope: 1,
    rsiMomentum: 1,
    macdMomentum: 1,
    structure: 2,
    relativeVolume: 1,
    nearbyLevelPenalty: 2,
    atrExtensionPenalty: 1,
  },
} as const;

export type StrategyConfig = typeof strategyConfig;

