import { randomUUID } from "node:crypto";
import path from "node:path";
import protobuf from "protobufjs";
import WebSocket from "ws";
import { z } from "zod";
import type { Candle, MarketInstrument, MarketTick, Timeframe } from "@/lib/domain/types";
import { reconnectBackoffMs } from "@/lib/domain/data-quality";
import { aggregateOptionChainOi, unavailablePutCallRatio } from "@/lib/domain/put-call-ratio";
import type { InstrumentQuery, MarketDataProvider } from "./market-data-provider";

const authorizeSchema = z.object({ status: z.literal("success"), data: z.object({ authorized_redirect_uri: z.string().url() }) });
const searchSchema = z.object({ status: z.literal("success"), data: z.array(z.record(z.string(), z.unknown())) });
const candleSchema = z.object({ status: z.literal("success"), data: z.object({ candles: z.array(z.array(z.union([z.string(), z.number()]))) }) });
const optionChainSchema = z.object({
  status: z.literal("success"),
  data: z.array(z.object({
    expiry: z.string().optional(),
    call_options: z.object({ market_data: z.object({ oi: z.number().nullable().optional() }).passthrough() }).passthrough().optional(),
    put_options: z.object({ market_data: z.object({ oi: z.number().nullable().optional() }).passthrough() }).passthrough().optional(),
  }).passthrough()),
});

type ProtoRecord = Record<string, unknown>;
const asRecord = (value: unknown): ProtoRecord | undefined => typeof value === "object" && value !== null ? value as ProtoRecord : undefined;
const numeric = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
  const record = asRecord(value);
  if (record && typeof record.toNumber === "function") return (record.toNumber as () => number)();
  return undefined;
};

export class UpstoxMarketDataProvider implements MarketDataProvider {
  readonly name = "upstox" as const;
  private socket: WebSocket | null = null;
  private feedResponse: protobuf.Type | null = null;
  private readonly instruments = new Map<string, MarketInstrument>();
  private readonly tickListeners = new Set<(tick: MarketTick) => void>();
  private readonly statusListeners = new Set<(status: string, message?: string) => void>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;

  constructor(private readonly accessToken: string) {
    if (!accessToken) throw new Error("UPSTOX_ACCESS_TOKEN is required for the Upstox provider");
  }

  async connect(): Promise<void> {
    this.intentionalClose = false;
    this.emitStatus(this.reconnectAttempt > 0 ? "RECONNECTING" : "CONNECTING");
    if (!this.feedResponse) {
      const root = await protobuf.load(path.join(process.cwd(), "services/market-data/proto/MarketDataFeed.proto"));
      this.feedResponse = root.lookupType("com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse");
    }
    const response = await fetch("https://api.upstox.com/v3/feed/market-data-feed/authorize", {
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Upstox feed authorization failed with HTTP ${response.status}`);
    const authorized = authorizeSchema.parse(await response.json());
    await this.openSocket(authorized.data.authorized_redirect_uri);
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close(1000, "shutdown");
    this.socket = null;
    this.emitStatus("DISCONNECTED");
  }

  async subscribe(instruments: MarketInstrument[]): Promise<void> {
    instruments.forEach((instrument) => this.instruments.set(instrument.instrumentKey, instrument));
    this.sendSubscription("sub", instruments.map((instrument) => instrument.instrumentKey));
  }

  async unsubscribe(instruments: MarketInstrument[]): Promise<void> {
    instruments.forEach((instrument) => this.instruments.delete(instrument.instrumentKey));
    this.sendSubscription("unsub", instruments.map((instrument) => instrument.instrumentKey));
  }

  async getQuote(instrument: MarketInstrument): Promise<MarketTick> {
    const response = await fetch(`https://api.upstox.com/v3/market-quote/ltp?instrument_key=${encodeURIComponent(instrument.instrumentKey)}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`Upstox quote failed with HTTP ${response.status}`);
    const body = asRecord(await response.json());
    const data = asRecord(body?.data);
    const quote = data ? asRecord(Object.values(data)[0]) : undefined;
    const ltp = numeric(quote?.last_price);
    if (ltp === undefined) throw new Error("Upstox quote response did not contain a valid last price");
    return { instrumentKey: instrument.instrumentKey, symbol: instrument.symbol, exchange: instrument.exchange, ltp, timestamp: Date.now() };
  }

  async getHistoricalCandles(instrument: MarketInstrument, timeframe: Timeframe, from: Date, to: Date): Promise<Candle[]> {
    const interval = timeframe === "1h" ? ["hours", "1"] : ["minutes", timeframe.slice(0, -1)];
    const date = (value: Date) => value.toISOString().slice(0, 10);
    const today = date(new Date());
    const endpoint = date(from) === today && date(to) === today
      ? `https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(instrument.instrumentKey)}/${interval[0]}/${interval[1]}`
      : `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrument.instrumentKey)}/${interval[0]}/${interval[1]}/${date(to)}/${date(from)}`;
    const response = await fetch(endpoint, { headers: this.headers() });
    if (!response.ok) throw new Error(`Upstox historical candles failed with HTTP ${response.status}`);
    const parsed = candleSchema.parse(await response.json());
    return parsed.data.candles.flatMap((row) => {
      const timestamp = Date.parse(String(row[0]));
      const values = row.slice(1, 7).map(Number);
      if (!Number.isFinite(timestamp) || values.slice(0, 5).some((value) => !Number.isFinite(value))) return [];
      return [{ instrumentKey: instrument.instrumentKey, timeframe, timestamp, open: values[0], high: values[1], low: values[2], close: values[3], volume: values[4] ?? 0, openInterest: Number.isFinite(values[5]) ? values[5] : undefined }];
    }).sort((left, right) => left.timestamp - right.timestamp);
  }

  async searchInstruments(query: InstrumentQuery): Promise<MarketInstrument[]> {
    const params = new URLSearchParams({ query: query.query, records: "100" });
    if (query.exchange) params.set("exchanges", query.exchange);
    if (query.segment) params.set("segments", query.segment);
    const response = await fetch(`https://api.upstox.com/v2/instruments/search?${params}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`Upstox instrument search failed with HTTP ${response.status}`);
    const parsed = searchSchema.parse(await response.json());
    return parsed.data.flatMap((row) => {
      const segment = String(row.segment ?? "");
      const instrumentType = String(row.instrument_type ?? "");
      if (!['NSE_INDEX','BSE_INDEX','MCX_FO'].includes(segment) || !['INDEX','FUT'].includes(instrumentType)) return [];
      const expiry = row.expiry === undefined ? undefined : Date.parse(`${String(row.expiry)}T23:59:59+05:30`);
      return [{ instrumentKey: String(row.instrument_key), symbol: String(row.trading_symbol), displayName: String(row.trading_symbol), exchange: String(row.exchange) as MarketInstrument['exchange'], segment: segment as MarketInstrument['segment'], instrumentType: instrumentType as MarketInstrument['instrumentType'], exchangeToken: String(row.exchange_token), expiry, lotSize: numeric(row.lot_size), tickSize: numeric(row.tick_size) }];
    });
  }

  async getPutCallRatio(instrument: MarketInstrument) {
    if (instrument.exchange === "MCX" || instrument.instrumentType !== "INDEX") return unavailablePutCallRatio();
    let lastError: Error | null = null;
    for (const expiryDate of ["current_week", "current_month"]) {
      const params = new URLSearchParams({ instrument_key: instrument.instrumentKey, expiry_date: expiryDate });
      const response = await fetch(`https://api.upstox.com/v2/option/chain?${params}`, { headers: this.headers() });
      if (!response.ok) {
        lastError = new Error(`Upstox option chain failed with HTTP ${response.status}`);
        continue;
      }
      const parsed = optionChainSchema.parse(await response.json());
      if (parsed.data.length === 0) continue;
      const ratio = aggregateOptionChainOi(parsed.data.map((row) => ({
        callOi: row.call_options?.market_data.oi,
        putOi: row.put_options?.market_data.oi,
      })), parsed.data[0]?.expiry ?? null);
      if (ratio.oi !== null) return ratio;
    }
    if (lastError) throw lastError;
    return unavailablePutCallRatio();
  }

  onTick(listener: (tick: MarketTick) => void) { this.tickListeners.add(listener); return () => this.tickListeners.delete(listener); }
  onStatus(listener: (status: string, message?: string) => void) { this.statusListeners.add(listener); return () => this.statusListeners.delete(listener); }

  private async openSocket(url: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, { followRedirects: true });
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      socket.once("open", () => {
        this.reconnectAttempt = 0;
        this.emitStatus("LIVE");
        if (this.instruments.size) this.sendSubscription("sub", [...this.instruments.keys()]);
        resolve();
      });
      socket.once("error", reject);
      socket.on("message", (data) => this.decode(data));
      socket.on("close", (code) => {
        this.socket = null;
        if (!this.intentionalClose) this.scheduleReconnect(`Upstox socket closed (${code})`);
      });
      socket.on("error", (error) => this.emitStatus("RECONNECTING", error.message));
    });
  }

  private decode(data: WebSocket.RawData) {
    if (!this.feedResponse) return;
    try {
      const message = this.feedResponse.toObject(this.feedResponse.decode(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)), { longs: String, enums: String });
      const feeds = asRecord(message.feeds) ?? {};
      for (const [instrumentKey, rawFeed] of Object.entries(feeds)) {
        const instrument = this.instruments.get(instrumentKey);
        const feed = asRecord(rawFeed);
        if (!instrument || !feed) continue;
        const fullFeed = asRecord(feed.fullFeed);
        const marketFeed = asRecord(fullFeed?.marketFF);
        const indexFeed = asRecord(fullFeed?.indexFF);
        const firstLevel = asRecord(feed.firstLevelWithGreeks);
        const ltpc = asRecord(feed.ltpc) ?? asRecord(marketFeed?.ltpc) ?? asRecord(indexFeed?.ltpc) ?? asRecord(firstLevel?.ltpc);
        const ltp = numeric(ltpc?.ltp);
        if (ltp === undefined || ltp <= 0) continue;
        const marketLevel = asRecord(marketFeed?.marketLevel);
        const marketDepth = Array.isArray(marketLevel?.bidAskQuote) ? asRecord(marketLevel.bidAskQuote[0]) : undefined;
        const depth = asRecord(firstLevel?.firstDepth) ?? marketDepth;
        const ohlcContainer = asRecord(marketFeed?.marketOHLC) ?? asRecord(indexFeed?.marketOHLC);
        const ohlcRows = Array.isArray(ohlcContainer?.ohlc) ? ohlcContainer.ohlc.map(asRecord).filter(Boolean) as ProtoRecord[] : [];
        const day = ohlcRows.find((row) => row.interval === "1d");
        const tick: MarketTick = {
          instrumentKey, symbol: instrument.symbol, exchange: instrument.exchange, ltp,
          timestamp: numeric(ltpc?.ltt) ?? Date.now(), previousClose: numeric(ltpc?.cp),
          open: numeric(day?.open), high: numeric(day?.high), low: numeric(day?.low),
          volume: numeric(marketFeed?.vtt) ?? numeric(firstLevel?.vtt), openInterest: numeric(marketFeed?.oi) ?? numeric(firstLevel?.oi),
          bid: numeric(depth?.bidP), ask: numeric(depth?.askP), bidQty: numeric(depth?.bidQ), askQty: numeric(depth?.askQ),
        };
        this.tickListeners.forEach((listener) => listener(tick));
      }
    } catch (error) {
      this.emitStatus("LIVE", `Ignored invalid Protobuf frame: ${error instanceof Error ? error.message : "decode error"}`);
    }
  }

  private sendSubscription(method: "sub" | "unsub", instrumentKeys: string[]) {
    if (this.socket?.readyState !== WebSocket.OPEN || instrumentKeys.length === 0) return;
    const payload = { guid: randomUUID(), method, data: { mode: "full", instrumentKeys } };
    this.socket.send(Buffer.from(JSON.stringify(payload), "utf8"));
  }

  private scheduleReconnect(message: string) {
    this.reconnectAttempt += 1;
    this.emitStatus("RECONNECTING", message);
    const delay = reconnectBackoffMs(this.reconnectAttempt, Math.floor(Math.random() * 300));
    this.reconnectTimer = setTimeout(() => this.connect().catch((error: unknown) => this.scheduleReconnect(error instanceof Error ? error.message : "reconnect failed")), delay);
  }
  private headers() { return { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" }; }
  private emitStatus(status: string, message?: string) { this.statusListeners.forEach((listener) => listener(status, message)); }
}
