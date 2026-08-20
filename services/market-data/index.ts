import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { CandleEngine } from "@/lib/domain/candle-engine";
import { calculateIndicators } from "@/lib/domain/indicators";
import { isFeedStale } from "@/lib/domain/data-quality";
import { deriveLevels } from "@/lib/domain/levels";
import { buildTradePlan } from "@/lib/domain/risk";
import { classifyRegime, scoreSignal } from "@/lib/domain/signals";
import { detectMarketStructure } from "@/lib/domain/structure";
import { advanceSetupLifecycle, initialSetupLifecycle } from "@/lib/domain/setup-lifecycle";
import { unavailablePutCallRatio } from "@/lib/domain/put-call-ratio";
import type { ConnectionState, HealthSnapshot, MarketAnalysis, MarketInstrument, MarketTick, PutCallRatio, TerminalSnapshot } from "@/lib/domain/types";
import { TIMEFRAMES } from "@/lib/domain/types";
import { inferSessionState } from "@/config/marketSessions";
import { strategyConfig } from "@/config/strategy";
import { InstrumentResolver } from "./instruments/instrument-resolver";
import { MarketDatabase } from "./persistence/database";
import type { MarketDataProvider } from "./providers/market-data-provider";
import { SimulationMarketDataProvider } from "./providers/simulation-provider";
import { UpstoxMarketDataProvider } from "./providers/upstox-provider";

loadEnv({ path: ".env.local" });
loadEnv();

const env = z.object({
  MARKET_DATA_PROVIDER: z.enum(["upstox", "simulation"]).default("upstox"),
  UPSTOX_ACCESS_TOKEN: z.string().optional(),
  MARKET_DATA_PORT: z.coerce.number().int().min(1024).max(65535).default(8787),
  MARKET_DATA_STALE_AFTER_MS: z.coerce.number().int().min(2_000).default(strategyConfig.staleAfterMs),
  DATABASE_PATH: z.string().default("./data/market-pulse.sqlite"),
}).parse(process.env);

const startedAt = Date.now();
const candleEngine = new CandleEngine();
let database: MarketDatabase | null = null;
const resolver = new InstrumentResolver();
const latestTicks = new Map<string, MarketTick>();
const signalStates = new Map<string, string>();
const setupLifecycles = new Map<string, ReturnType<typeof initialSetupLifecycle>>();
const putCallRatios = new Map<string, PutCallRatio>();
let provider: MarketDataProvider | null = null;
let pcrRefreshTimer: NodeJS.Timeout | null = null;
let instruments: MarketInstrument[] = [];
let goldmContracts: MarketInstrument[] = [];
let selectedGoldm: MarketInstrument | null = null;
let connectionState: ConnectionState = "DISCONNECTED";
let connectionMessage: string | undefined;
let lastTickAt: number | null = null;
let tickCounter = 0;
let ticksPerSecond = 0;
let reconnectCount = 0;
let historicalApiStatus: HealthSnapshot["historicalApiStatus"] = "NOT_CHECKED";

const fallbackSimulationInstruments = (): { instruments: MarketInstrument[]; contracts: MarketInstrument[] } => {
  const expiry = Date.now() + 45 * 86_400_000;
  const contracts: MarketInstrument[] = [{ instrumentKey: "SIM_MCX_FO|GOLDM1", symbol: "GOLDM", displayName: "GOLDM SIMULATED CONTRACT", exchange: "MCX", segment: "MCX_FO", instrumentType: "FUT", exchangeToken: "SIM1", expiry, lotSize: 100, tickSize: 1 }];
  return { instruments: [contracts[0], { instrumentKey: "SIM_NSE_INDEX|Nifty 50", symbol: "NIFTY", displayName: "NIFTY 50", exchange: "NSE", segment: "NSE_INDEX", instrumentType: "INDEX", exchangeToken: "26000" }, { instrumentKey: "SIM_BSE_INDEX|SENSEX", symbol: "SENSEX", displayName: "SENSEX", exchange: "BSE", segment: "BSE_INDEX", instrumentType: "INDEX", exchangeToken: "1" }], contracts };
};

async function initialize() {
  database = await MarketDatabase.open(env.DATABASE_PATH);
  try {
    const core = await resolver.resolveCore();
    goldmContracts = core.goldmContracts;
    const savedGoldmKey = database.getSetting<string | null>("selectedGoldm", null);
    selectedGoldm = goldmContracts.find((contract) => contract.instrumentKey === savedGoldmKey) ?? core.goldm;
    instruments = [selectedGoldm, core.nifty, core.sensex];
  } catch (error) {
    if (env.MARKET_DATA_PROVIDER === "upstox") throw error;
    const fallback = fallbackSimulationInstruments();
    instruments = fallback.instruments;
    goldmContracts = fallback.contracts;
    selectedGoldm = fallback.contracts[0];
    connectionMessage = "Official instrument master unavailable; using simulation-only identifiers";
  }

  if (env.MARKET_DATA_PROVIDER === "upstox") {
    if (!env.UPSTOX_ACCESS_TOKEN) {
      connectionState = "DISCONNECTED";
      connectionMessage = "LIVE DATA DISCONNECTED — UPSTOX_ACCESS_TOKEN is not configured";
      return;
    }
    provider = new UpstoxMarketDataProvider(env.UPSTOX_ACCESS_TOKEN);
  } else {
    provider = new SimulationMarketDataProvider();
  }
  provider.onTick(handleTick);
  provider.onStatus((status, message) => {
    if (status === "RECONNECTING") reconnectCount += 1;
    connectionState = status as ConnectionState;
    connectionMessage = message;
    if (status === "LIVE" || status === "SIMULATION") database?.saveAlert("CONNECTION", null, status === "LIVE" ? "Live market data connected" : "Simulation feed started");
  });
  await backfill(provider, instruments);
  await provider.connect();
  await provider.subscribe(instruments);
  await refreshPutCallRatios();
  pcrRefreshTimer = setInterval(() => void refreshPutCallRatios(), 60_000);
}

async function refreshPutCallRatios() {
  if (!provider) return;
  await Promise.all(instruments.map(async (instrument) => {
    if (instrument.exchange === "MCX" || instrument.instrumentType !== "INDEX") {
      putCallRatios.set(instrument.instrumentKey, unavailablePutCallRatio());
      return;
    }
    try {
      putCallRatios.set(instrument.instrumentKey, await provider!.getPutCallRatio(instrument));
    } catch (error) {
      if (!putCallRatios.has(instrument.instrumentKey)) putCallRatios.set(instrument.instrumentKey, unavailablePutCallRatio());
      console.warn(JSON.stringify({ level: "warn", event: "pcr_refresh_failed", symbol: instrument.symbol, message: safeMessage(error) }));
    }
  }));
}

async function backfill(activeProvider: MarketDataProvider, targetInstruments: MarketInstrument[]) {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 5 * 86_400_000);
    const batches = await Promise.all(targetInstruments.flatMap((instrument) => TIMEFRAMES.map((timeframe) => activeProvider.getHistoricalCandles(instrument, timeframe, from, to))));
    batches.forEach((candles) => candleEngine.seed(candles));
    historicalApiStatus = activeProvider.name === "simulation" ? "SIMULATED" : "OK";
  } catch (error) {
    historicalApiStatus = "ERROR";
    connectionMessage = `Historical backfill failed: ${safeMessage(error)}`;
  }
}

function handleTick(tick: MarketTick) {
  if (!Number.isFinite(tick.ltp) || tick.ltp <= 0 || tick.timestamp > Date.now() + 5_000) return;
  const previous = latestTicks.get(tick.instrumentKey);
  if (previous && tick.timestamp <= previous.timestamp) return;
  latestTicks.set(tick.instrumentKey, tick);
  candleEngine.ingest(tick);
  lastTickAt = Date.now();
  tickCounter += 1;
}

function analyze(instrument: MarketInstrument): MarketAnalysis | null {
  const tick = latestTicks.get(instrument.instrumentKey);
  if (!tick) return null;
  const primary = candleEngine.get(instrument.instrumentKey, "5m", 240);
  const indicators = calculateIndicators(primary);
  const structure = detectMarketStructure(primary);
  const levels = deriveLevels(primary, indicators.atr);
  const signal = connectionState === "STALE" || connectionState === "DISCONNECTED"
    ? { direction: "WAIT" as const, score: 0, maxScore: 10, quality: "LOW" as const, reasons: [{ passed: false, label: "Signals paused — stale or disconnected market data", weight: 0 }], generatedAt: Date.now() }
    : scoreSignal(tick.ltp, indicators, structure, levels);
  const regime = classifyRegime(indicators, structure);
  const tradePlan = buildTradePlan(tick.ltp, indicators, levels, signal);
  const previousLifecycle = setupLifecycles.get(instrument.instrumentKey) ?? initialSetupLifecycle();
  const setupLifecycle = advanceSetupLifecycle(previousLifecycle, {
    price: tick.ltp,
    tickTimestamp: tick.timestamp,
    signal,
    candidatePlan: tradePlan,
    dataUsable: connectionState !== "STALE" && connectionState !== "DISCONNECTED",
  });
  setupLifecycles.set(instrument.instrumentKey, setupLifecycle);
  const sessionHigh = tick.high ?? Math.max(...primary.map((candle) => candle.high), tick.ltp);
  const sessionLow = tick.low ?? Math.min(...primary.map((candle) => candle.low), tick.ltp);
  const previousClose = tick.previousClose;
  const analysis: MarketAnalysis = {
    instrument, tick,
    candles: Object.fromEntries(TIMEFRAMES.map((timeframe) => [timeframe, candleEngine.get(instrument.instrumentKey, timeframe, 240)])),
    indicators, structure, levels, regime, signal, tradePlan, setupLifecycle,
    putCallRatio: putCallRatios.get(instrument.instrumentKey) ?? unavailablePutCallRatio(),
    sessionHigh, sessionLow,
    change: previousClose ? tick.ltp - previousClose : 0,
    changePercent: previousClose ? ((tick.ltp - previousClose) / previousClose) * 100 : 0,
  };
  const priorSignal = signalStates.get(instrument.instrumentKey);
  if (signal.direction !== "WAIT" && priorSignal !== signal.direction) {
    database?.saveSignal(analysis, "5m");
    database?.saveAlert("SIGNAL_CHANGED", instrument.instrumentKey, `${instrument.symbol}: ${signal.direction} (${signal.score}/10)`);
  }
  signalStates.set(instrument.instrumentKey, signal.direction);
  return analysis;
}

function health(): HealthSnapshot {
  return {
    provider: env.MARKET_DATA_PROVIDER,
    connectionState,
    tokenConfigured: Boolean(env.UPSTOX_ACCESS_TOKEN),
    lastTickAt, ticksPerSecond,
    latencyMs: lastTickAt && latestTicks.size ? Math.max(0, Date.now() - Math.max(...[...latestTicks.values()].map((tick) => tick.timestamp))) : null,
    reconnectCount,
    subscribedInstruments: instruments.map((instrument) => instrument.instrumentKey),
    selectedGoldm, historicalApiStatus,
    databaseStatus: database?.ping() ? "OK" : "ERROR",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    sessions: { NSE: inferSessionState("NSE"), BSE: inferSessionState("BSE"), MCX: inferSessionState("MCX") },
    message: connectionMessage,
  };
}

function snapshot(): TerminalSnapshot {
  const markets: Record<string, MarketAnalysis> = {};
  instruments.forEach((instrument) => { const value = analyze(instrument); if (value) markets[instrument.symbol] = value; });
  return { type: "snapshot", health: health(), markets, goldmContracts, timestamp: Date.now() };
}

const server = createServer(async (request, response) => {
  cors(request, response);
  if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, health());
    if (request.method === "GET" && url.pathname === "/snapshot") return json(response, 200, snapshot());
    if (request.method === "GET" && url.pathname === "/signals") return json(response, 200, database?.listSignals(Number(url.searchParams.get("limit") ?? 200)) ?? []);
    if (request.method === "GET" && url.pathname === "/settings") return json(response, 200, database?.getSetting("userSettings", defaultSettings) ?? defaultSettings);
    if (request.method === "PUT" && url.pathname === "/settings") {
      const body = settingsSchema.parse(await readJson(request)); database?.setSetting("userSettings", body); return json(response, 200, body);
    }
    if (request.method === "POST" && url.pathname === "/goldm/select") {
      const body = z.object({ instrumentKey: z.string() }).parse(await readJson(request));
      const contract = goldmContracts.find((item) => item.instrumentKey === body.instrumentKey);
      if (!contract) return json(response, 404, { error: "GOLDM contract not found" });
      const previous = selectedGoldm; selectedGoldm = contract; database?.setSetting("selectedGoldm", contract.instrumentKey);
      instruments = [contract, ...instruments.filter((item) => item.symbol !== "GOLDM")];
      if (provider && previous) { await provider.unsubscribe([previous]); await backfill(provider, [contract]); await provider.subscribe([contract]); }
      return json(response, 200, { selectedGoldm });
    }
    if (request.method === "POST" && url.pathname === "/reconnect") {
      if (!provider) return json(response, 409, { error: "Provider is not configured" });
      await provider.disconnect(); await provider.connect(); await provider.subscribe(instruments); return json(response, 200, health());
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) { return json(response, 400, { error: safeMessage(error) }); }
});

const wss = new WebSocketServer({ server, path: "/stream" });
wss.on("connection", (socket) => socket.send(JSON.stringify(snapshot())));
setInterval(() => {
  const message = JSON.stringify(snapshot());
  wss.clients.forEach((client) => { if (client.readyState === WebSocket.OPEN) client.send(message); });
}, 750);
setInterval(() => { ticksPerSecond = tickCounter; tickCounter = 0; if (connectionState === "LIVE" && isFeedStale(lastTickAt, Date.now(), env.MARKET_DATA_STALE_AFTER_MS)) { connectionState = "STALE"; connectionMessage = "SIGNALS PAUSED — STALE MARKET DATA"; database?.saveAlert("STALE_FEED", null, connectionMessage); } }, 1_000);

server.listen(env.MARKET_DATA_PORT, "127.0.0.1", () => {
  console.log(JSON.stringify({ level: "info", event: "market_data_service_started", port: env.MARKET_DATA_PORT, provider: env.MARKET_DATA_PROVIDER, tokenConfigured: Boolean(env.UPSTOX_ACCESS_TOKEN) }));
  initialize().catch((error) => { connectionState = "DISCONNECTED"; connectionMessage = safeMessage(error); console.error(JSON.stringify({ level: "error", event: "initialization_failed", message: connectionMessage })); });
});

async function shutdown() { if (pcrRefreshTimer) clearInterval(pcrRefreshTimer); await provider?.disconnect(); wss.close(); server.close(); database?.close(); }
process.once("SIGINT", () => shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => shutdown().finally(() => process.exit(0)));

const settingsSchema = z.object({ defaultInstrument: z.enum(["GOLDM", "NIFTY", "SENSEX"]), defaultTimeframe: z.enum(TIMEFRAMES), minimumRiskReward: z.number().min(1).max(10), soundEnabled: z.boolean(), browserNotifications: z.boolean(), indicatorToggles: z.record(z.string(), z.boolean()) });
const defaultSettings = { defaultInstrument: "GOLDM", defaultTimeframe: "5m", minimumRiskReward: 1.5, soundEnabled: false, browserNotifications: false, indicatorToggles: { ema9: true, ema21: true, ema50: true, vwap: true, levels: true } };
function safeMessage(error: unknown) { return error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]") : "Unexpected local service error"; }
function json(response: ServerResponse, status: number, data: unknown) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(data)); }
function cors(request: IncomingMessage, response: ServerResponse) { const origin = request.headers.origin; if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) response.setHeader("Access-Control-Allow-Origin", origin); response.setHeader("Access-Control-Allow-Headers", "content-type"); response.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS"); }
async function readJson(request: IncomingMessage) { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); if (chunks.reduce((sum, chunk) => sum + chunk.length, 0) > 1_000_000) throw new Error("Request body is too large"); return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
