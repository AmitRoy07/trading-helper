export const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h"] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];
export type Exchange = "NSE" | "BSE" | "MCX";
export type ConnectionState =
  | "LIVE"
  | "CONNECTING"
  | "RECONNECTING"
  | "STALE"
  | "DISCONNECTED"
  | "SIMULATION";

export type MarketInstrument = {
  instrumentKey: string;
  symbol: string;
  displayName: string;
  exchange: Exchange;
  segment: "NSE_INDEX" | "BSE_INDEX" | "MCX_FO";
  instrumentType: "INDEX" | "FUT";
  exchangeToken: string;
  expiry?: number;
  lotSize?: number;
  tickSize?: number;
};

export type MarketTick = {
  instrumentKey: string;
  symbol: string;
  exchange: Exchange;
  ltp: number;
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
  bidQty?: number;
  askQty?: number;
};

export type Candle = {
  instrumentKey: string;
  timeframe: Timeframe;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
};

export type IndicatorSnapshot = {
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema21Slope: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  vwap: number | null;
  atr: number | null;
  atrPercent: number | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  relativeVolume: number | null;
};

export type StructureLabel =
  | "HIGHER HIGH / HIGHER LOW"
  | "LOWER HIGH / LOWER LOW"
  | "BULLISH BOS"
  | "BEARISH BOS"
  | "CHANGE OF CHARACTER"
  | "CONSOLIDATION"
  | "BREAKOUT"
  | "FAILED BREAKOUT"
  | "MIXED";

export type LevelType = "SUPPORT" | "RESISTANCE" | "REFERENCE";
export type PriceLevel = {
  price: number;
  type: LevelType;
  strength: number;
  touches: number;
  source: string[];
};

export type SignalDirection =
  | "STRONG LONG"
  | "LONG"
  | "WAIT"
  | "SHORT"
  | "STRONG SHORT";
export type SetupQuality = "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH";
export type MarketRegime =
  | "STRONG TREND"
  | "TREND"
  | "RANGE"
  | "HIGH VOLATILITY"
  | "LOW VOLATILITY"
  | "BREAKOUT"
  | "UNCERTAIN";

export type SignalAssessment = {
  direction: SignalDirection;
  score: number;
  maxScore: number;
  quality: SetupQuality;
  reasons: { passed: boolean; label: string; weight: number }[];
  generatedAt: number;
};

export type TradePlan = {
  bias: Exclude<SignalDirection, "WAIT">;
  entryLow: number;
  entryHigh: number;
  invalidation: number;
  target1: number;
  target2: number;
  riskReward: number;
  quality: SetupQuality;
} | null;

export type SetupStage =
  | "NO SETUP"
  | "WATCHING LONG"
  | "LONG READY"
  | "LONG ACTIVE"
  | "WATCHING SHORT"
  | "SHORT READY"
  | "SHORT ACTIVE"
  | "TARGET HIT"
  | "INVALIDATED";

export type SetupLifecycle = {
  stage: SetupStage;
  direction: "LONG" | "SHORT" | null;
  plan: TradePlan;
  startedAt: number | null;
  updatedAt: number;
  lastProcessedTick: number;
  note: string;
};

export type PutCallRatio = {
  oi: number | null;
  totalPutOi: number | null;
  totalCallOi: number | null;
  expiry: string | null;
  updatedAt: number | null;
  source: "UPSTOX_OPTION_CHAIN" | "UNAVAILABLE";
};

export type MarketAnalysis = {
  instrument: MarketInstrument;
  tick: MarketTick;
  candles: Partial<Record<Timeframe, Candle[]>>;
  indicators: IndicatorSnapshot;
  structure: StructureLabel;
  levels: PriceLevel[];
  regime: MarketRegime;
  signal: SignalAssessment;
  tradePlan: TradePlan;
  setupLifecycle: SetupLifecycle;
  putCallRatio: PutCallRatio;
  sessionHigh: number;
  sessionLow: number;
  change: number;
  changePercent: number;
};

export type HealthSnapshot = {
  provider: "upstox" | "simulation";
  connectionState: ConnectionState;
  tokenConfigured: boolean;
  lastTickAt: number | null;
  ticksPerSecond: number;
  latencyMs: number | null;
  reconnectCount: number;
  subscribedInstruments: string[];
  selectedGoldm: MarketInstrument | null;
  historicalApiStatus: "OK" | "ERROR" | "NOT_CHECKED" | "SIMULATED";
  databaseStatus: "OK" | "ERROR";
  uptimeSeconds: number;
  sessions: Record<Exchange, "OPEN" | "CLOSED" | "PRE_OPEN" | "UNKNOWN">;
  message?: string;
};

export type TerminalSnapshot = {
  type: "snapshot";
  health: HealthSnapshot;
  markets: Record<string, MarketAnalysis>;
  goldmContracts: MarketInstrument[];
  timestamp: number;
};
