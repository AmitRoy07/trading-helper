import type { Candle, MarketInstrument, MarketTick, PutCallRatio, Timeframe } from "@/lib/domain/types";

export type InstrumentQuery = {
  query: string;
  exchange?: "NSE" | "BSE" | "MCX";
  segment?: string;
  instrumentType?: "INDEX" | "FUT";
};

export interface MarketDataProvider {
  readonly name: "upstox" | "simulation";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(instruments: MarketInstrument[]): Promise<void>;
  unsubscribe(instruments: MarketInstrument[]): Promise<void>;
  getQuote(instrument: MarketInstrument): Promise<MarketTick>;
  getHistoricalCandles(
    instrument: MarketInstrument,
    timeframe: Timeframe,
    from: Date,
    to: Date,
  ): Promise<Candle[]>;
  searchInstruments(query: InstrumentQuery): Promise<MarketInstrument[]>;
  getPutCallRatio(instrument: MarketInstrument): Promise<PutCallRatio>;
  onTick(listener: (tick: MarketTick) => void): () => void;
  onStatus(listener: (status: string, message?: string) => void): () => void;
}
