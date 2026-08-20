import { gunzipSync } from "node:zlib";
import { z } from "zod";
import type { MarketInstrument } from "@/lib/domain/types";

const instrumentSchema = z.object({
  segment: z.string(),
  name: z.string(),
  exchange: z.string(),
  instrument_type: z.string(),
  instrument_key: z.string(),
  exchange_token: z.union([z.string(), z.number()]),
  trading_symbol: z.string(),
  underlying_symbol: z.string().optional(),
  asset_symbol: z.string().optional(),
  expiry: z.union([z.string(), z.number()]).optional(),
  lot_size: z.number().optional(),
  tick_size: z.number().optional(),
});

type RawInstrument = z.infer<typeof instrumentSchema>;

const URLS = {
  NSE: "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
  BSE: "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz",
  MCX: "https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz",
} as const;

export class InstrumentResolver {
  private cache = new Map<keyof typeof URLS, { loadedAt: number; data: RawInstrument[] }>();
  constructor(private readonly cacheTtlMs = 6 * 60 * 60 * 1000) {}

  async resolveCore(now = Date.now()): Promise<{
    nifty: MarketInstrument;
    sensex: MarketInstrument;
    goldm: MarketInstrument;
    goldmContracts: MarketInstrument[];
  }> {
    const [nse, bse, mcx] = await Promise.all([this.load("NSE"), this.load("BSE"), this.load("MCX")]);
    const niftyRaw = nse.find(
      (row) => row.segment === "NSE_INDEX" && row.instrument_type === "INDEX" && row.name.toLowerCase() === "nifty 50",
    );
    const sensexRaw = bse.find(
      (row) => row.segment === "BSE_INDEX" && row.instrument_type === "INDEX" && row.trading_symbol === "SENSEX",
    );
    const goldmContracts = this.resolveGoldmContracts(mcx, now);
    if (!niftyRaw || !sensexRaw || goldmContracts.length === 0) {
      throw new Error("Required NIFTY 50, SENSEX, or unexpired GOLDM instrument was not found in the current Upstox master");
    }
    return {
      nifty: this.normalize(niftyRaw),
      sensex: this.normalize(sensexRaw),
      goldm: goldmContracts[0],
      goldmContracts,
    };
  }

  resolveGoldmContracts(rows: RawInstrument[], now = Date.now()): MarketInstrument[] {
    return rows
      .filter((row) => {
        const symbol = `${row.underlying_symbol ?? ""} ${row.asset_symbol ?? ""}`.toUpperCase();
        const expiry = this.expiryMs(row.expiry);
        return row.exchange === "MCX" && row.segment === "MCX_FO" && row.instrument_type === "FUT" && /\bGOLDM\b/.test(symbol) && expiry !== undefined && expiry > now;
      })
      .map((row) => this.normalize(row))
      .sort((left, right) => (left.expiry ?? Infinity) - (right.expiry ?? Infinity));
  }

  private async load(exchange: keyof typeof URLS): Promise<RawInstrument[]> {
    const cached = this.cache.get(exchange);
    if (cached && Date.now() - cached.loadedAt < this.cacheTtlMs) return cached.data;
    const response = await fetch(URLS[exchange]);
    if (!response.ok) throw new Error(`Upstox ${exchange} instrument master returned HTTP ${response.status}`);
    const json: unknown = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"));
    const rows = z.array(instrumentSchema).parse(json);
    this.cache.set(exchange, { loadedAt: Date.now(), data: rows });
    return rows;
  }

  private normalize(row: RawInstrument): MarketInstrument {
    const expiry = this.expiryMs(row.expiry);
    return {
      instrumentKey: row.instrument_key,
      symbol: row.segment === "NSE_INDEX" ? "NIFTY" : row.segment === "BSE_INDEX" ? "SENSEX" : "GOLDM",
      displayName: row.trading_symbol,
      exchange: row.exchange as "NSE" | "BSE" | "MCX",
      segment: row.segment as "NSE_INDEX" | "BSE_INDEX" | "MCX_FO",
      instrumentType: row.instrument_type as "INDEX" | "FUT",
      exchangeToken: String(row.exchange_token),
      expiry,
      lotSize: row.lot_size,
      tickSize: row.tick_size === undefined ? undefined : row.tick_size / 100,
    };
  }

  private expiryMs(value: RawInstrument["expiry"]): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Date.parse(`${value}T23:59:59+05:30`);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }
}

export type InstrumentMasterRow = RawInstrument;

