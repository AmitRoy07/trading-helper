import { describe, expect, it } from "vitest";
import { CandleEngine } from "@/lib/domain/candle-engine";
import { atr, bollingerBands, ema, macd, rsi, vwap } from "@/lib/domain/indicators";
import { clusterLevels } from "@/lib/domain/levels";
import { buildTradePlan } from "@/lib/domain/risk";
import { scoreSignal } from "@/lib/domain/signals";
import { detectMarketStructure, detectSwings } from "@/lib/domain/structure";
import { isFeedStale, reconnectBackoffMs } from "@/lib/domain/data-quality";
import { openingRange } from "@/lib/domain/opening-range";
import { advanceSetupLifecycle, initialSetupLifecycle } from "@/lib/domain/setup-lifecycle";
import { aggregateOptionChainOi } from "@/lib/domain/put-call-ratio";
import type { Candle, IndicatorSnapshot, MarketTick, SignalAssessment, TradePlan } from "@/lib/domain/types";
import { InstrumentResolver, type InstrumentMasterRow } from "@/services/market-data/instruments/instrument-resolver";

const candle = (index: number, close = 100 + index, volume = 100): Candle => ({ instrumentKey: "TEST|1", timeframe: "1m", timestamp: 1_700_000_000_000 + index * 60_000, open: close - 0.5, high: close + 1, low: close - 1, close, volume });

describe("technical indicators", () => {
  it("calculates EMA and handles insufficient input", () => { expect(ema([1,2], 3)).toEqual([null,null]); expect(ema([1,2,3,4], 3)).toEqual([null,null,2,3]); });
  it("calculates RSI with gain-only series", () => { expect(rsi(Array.from({length:20},(_,i)=>i+1),14).at(-1)).toBe(100); expect(rsi([],14)).toEqual([]); });
  it("calculates Wilder ATR", () => { const result=atr(Array.from({length:20},(_,i)=>candle(i)),14); expect(result[12]).toBeNull(); expect(result.at(-1)).toBeCloseTo(2); });
  it("calculates MACD without fabricating early values", () => { const result=macd(Array.from({length:60},(_,i)=>i)); expect(result.line[24]).toBeNull(); expect(result.histogram.at(-1)).toBeCloseTo(0,5); });
  it("returns N/A-compatible null VWAP for zero volume", () => { expect(vwap([candle(0,100,0),candle(1,101,0)])).toEqual([null,null]); expect(vwap([candle(0,100,10)]).at(-1)).toBeCloseTo(100); });
  it("calculates Bollinger bands", () => { const bands=bollingerBands(Array.from({length:20},()=>10)); expect(bands.middle.at(-1)).toBe(10); expect(bands.upper.at(-1)).toBe(10); });
});

describe("candle and market data quality", () => {
  it("aggregates, rolls over, and rejects duplicates/out-of-order ticks", () => {
    const engine=new CandleEngine(); const base=Date.now()-120_000;
    const tick=(timestamp:number,ltp:number):MarketTick=>({instrumentKey:"TEST|1",symbol:"TEST",exchange:"NSE",timestamp,ltp,volume:10});
    expect(engine.ingest(tick(base,100))).toHaveLength(6); engine.ingest(tick(base+10_000,105));
    expect(engine.get("TEST|1","1m").at(-1)?.high).toBe(105);
    expect(engine.ingest(tick(base+10_000,110))).toEqual([]); expect(engine.ingest(tick(base-1,90))).toEqual([]);
    engine.ingest(tick(base+70_000,103)); expect(engine.get("TEST|1","1m").length).toBeGreaterThanOrEqual(2);
  });
  it("detects stale feeds and uses bounded reconnect backoff", () => { expect(isFeedStale(1_000,17_000,15_000)).toBe(true); expect(isFeedStale(null,20_000,15_000)).toBe(false); expect(reconnectBackoffMs(1)).toBe(1_000); expect(reconnectBackoffMs(20)).toBe(30_000); });
});

describe("deterministic analysis", () => {
  it("detects swings and bullish structure", () => {
    const closes=[12,13,16,13,12,14,15,18,15,14,16,17,20,17,16,18,19,22]; const candles=closes.map((value,index)=>candle(index,value));
    expect(detectSwings(candles,1).length).toBeGreaterThan(2); expect(["HIGHER HIGH / HIGHER LOW","BULLISH BOS"]).toContain(detectMarketStructure(candles));
  });
  it("clusters ATR-near levels and combines sources", () => { const result=clusterLevels([{price:100,type:"SUPPORT",touches:2,source:["swing"]},{price:100.2,type:"REFERENCE",touches:1,source:["VWAP"]}],1,0.3); expect(result).toHaveLength(1); expect(result[0].source).toEqual(["swing","VWAP"]); });
  it("scores multi-factor confluence and builds structure-aware risk", () => {
    const indicators:IndicatorSnapshot={ema9:105,ema21:103,ema50:100,ema21Slope:1,rsi:61,macd:2,macdSignal:1,macdHistogram:1,vwap:102,atr:2,atrPercent:.2,bollingerUpper:110,bollingerMiddle:103,bollingerLower:96,relativeVolume:1.5};
    const levels=[{price:98,type:"SUPPORT" as const,strength:4,touches:2,source:["swing"]},{price:112,type:"RESISTANCE" as const,strength:4,touches:2,source:["swing"]}];
    const signal=scoreSignal(106,indicators,"HIGHER HIGH / HIGHER LOW",levels); expect(signal.direction).toBe("STRONG LONG");
    const plan=buildTradePlan(106,indicators,levels,signal); expect(plan).not.toBeNull(); expect(plan?.invalidation).toBeLessThan(plan?.entryLow ?? 0); expect(plan?.riskReward).toBeGreaterThanOrEqual(1.5);
  });
  it("calculates opening range states", () => { const candles=Array.from({length:7},(_,index)=>candle(index,index===6?120:100+index)); expect(openingRange(candles,5).state).toBe("BREAKOUT_UP"); });
});

describe("GOLDM resolution", () => {
  it("discards expiry and selects ascending unexpired GOLDM futures only", () => {
    const now=Date.now(); const row=(symbol:string,expiry:number,token:string):InstrumentMasterRow=>({segment:"MCX_FO",name:"GOLD",exchange:"MCX",instrument_type:"FUT",instrument_key:`MCX_FO|${token}`,exchange_token:token,trading_symbol:`${symbol} FUT`,underlying_symbol:symbol,asset_symbol:symbol,expiry,lot_size:100,tick_size:100});
    const result=new InstrumentResolver().resolveGoldmContracts([row("GOLDM",now-1,"old"),row("GOLDM",now+2000,"later"),row("GOLDM",now+1000,"near"),row("GOLD",now+500,"wrong")],now);
    expect(result.map((item)=>item.exchangeToken)).toEqual(["near","later"]); expect(result[0].tickSize).toBe(1);
  });
});

describe("setup lifecycle", () => {
  const signal = (score: number): SignalAssessment => ({
    direction: score >= 3 ? "LONG" : score <= -3 ? "SHORT" : "WAIT",
    score, maxScore: 10, quality: "MEDIUM", reasons: [], generatedAt: 1,
  });
  const plan = (direction: "LONG" | "SHORT"): TradePlan => ({
    bias: direction, entryLow: 99, entryHigh: 101,
    invalidation: direction === "LONG" ? 95 : 105,
    target1: direction === "LONG" ? 110 : 90,
    target2: direction === "LONG" ? 115 : 85,
    riskReward: 2, quality: "HIGH",
  });
  it("moves a long setup from watching through target", () => {
    let state = initialSetupLifecycle();
    state = advanceSetupLifecycle(state, { price: 103, tickTimestamp: 1, signal: signal(3), candidatePlan: null, dataUsable: true });
    expect(state.stage).toBe("WATCHING LONG");
    state = advanceSetupLifecycle(state, { price: 103, tickTimestamp: 2, signal: signal(5), candidatePlan: plan("LONG"), dataUsable: true });
    expect(state.stage).toBe("LONG READY");
    state = advanceSetupLifecycle(state, { price: 100, tickTimestamp: 3, signal: signal(5), candidatePlan: plan("LONG"), dataUsable: true });
    expect(state.stage).toBe("LONG ACTIVE");
    state = advanceSetupLifecycle(state, { price: 110, tickTimestamp: 4, signal: signal(4), candidatePlan: null, dataUsable: true });
    expect(state.stage).toBe("TARGET HIT");
  });
  it("moves a short setup through invalidation and pauses on stale data", () => {
    let state = initialSetupLifecycle();
    state = advanceSetupLifecycle(state, { price: 97, tickTimestamp: 1, signal: signal(-3), candidatePlan: null, dataUsable: true });
    expect(state.stage).toBe("WATCHING SHORT");
    state = advanceSetupLifecycle(state, { price: 97, tickTimestamp: 2, signal: signal(-5), candidatePlan: plan("SHORT"), dataUsable: true });
    state = advanceSetupLifecycle(state, { price: 100, tickTimestamp: 3, signal: signal(-5), candidatePlan: plan("SHORT"), dataUsable: true });
    expect(state.stage).toBe("SHORT ACTIVE");
    state = advanceSetupLifecycle(state, { price: 106, tickTimestamp: 4, signal: signal(-4), candidatePlan: null, dataUsable: true });
    expect(state.stage).toBe("INVALIDATED");
    state = advanceSetupLifecycle(state, { price: 106, tickTimestamp: 5, signal: signal(-4), candidatePlan: null, dataUsable: false });
    expect(state.stage).toBe("NO SETUP");
  });
});

describe("put/call ratio", () => {
  it("aggregates strike-level open interest", () => {
    const result = aggregateOptionChainOi([{ callOi: 100, putOi: 125 }, { callOi: 300, putOi: 275 }], "2026-08-27", 123);
    expect(result.oi).toBe(1);
    expect(result.totalCallOi).toBe(400);
    expect(result.totalPutOi).toBe(400);
    expect(result.expiry).toBe("2026-08-27");
    expect(result.updatedAt).toBe(123);
  });
  it("returns N/A-compatible null when call OI cannot form a ratio", () => {
    expect(aggregateOptionChainOi([{ callOi: 0, putOi: 50 }], null).oi).toBeNull();
    expect(aggregateOptionChainOi([], null).source).toBe("UNAVAILABLE");
  });
});
