"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { ema, vwap } from "@/lib/domain/indicators";
import type { MarketAnalysis, Timeframe } from "@/lib/domain/types";

type Props = { analysis: MarketAnalysis; timeframe: Timeframe };

export function MarketChart({ analysis, timeframe }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema9Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Series = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const planLines = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!container.current) return;
    const instance = createChart(container.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0b0e13" }, textColor: "#777f8e", fontFamily: "IBM Plex Mono" },
      grid: { vertLines: { color: "rgba(255,255,255,.035)" }, horzLines: { color: "rgba(255,255,255,.035)" } },
      crosshair: { vertLine: { color: "#566071", labelBackgroundColor: "#272d37" }, horzLine: { color: "#566071", labelBackgroundColor: "#272d37" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,.08)", scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: "rgba(255,255,255,.08)", timeVisible: true, secondsVisible: false, rightOffset: 5,
        tickMarkFormatter: (time: Time) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(Number(time) * 1000) },
    });
    chart.current = instance;
    candleSeries.current = instance.addSeries(CandlestickSeries, { upColor: "#21c98b", downColor: "#f05063", wickUpColor: "#21c98b", wickDownColor: "#f05063", borderVisible: false });
    volumeSeries.current = instance.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", color: "rgba(70,132,255,.3)" });
    instance.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    ema9Series.current = instance.addSeries(LineSeries, { color: "#f5c85b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ema21Series.current = instance.addSeries(LineSeries, { color: "#5f9cff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ema50Series.current = instance.addSeries(LineSeries, { color: "#a979e9", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    vwapSeries.current = instance.addSeries(LineSeries, { color: "#37c9d7", lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    return () => { instance.remove(); chart.current = null; };
  }, []);

  useEffect(() => {
    const candles = analysis.candles[timeframe] ?? [];
    if (!candleSeries.current || candles.length === 0) return;
    const time = (timestamp: number) => Math.floor(timestamp / 1000) as UTCTimestamp;
    candleSeries.current.setData(candles.map((candle) => ({ time: time(candle.timestamp), open: candle.open, high: candle.high, low: candle.low, close: candle.close })));
    volumeSeries.current?.setData(candles.map((candle) => ({ time: time(candle.timestamp), value: candle.volume, color: candle.close >= candle.open ? "rgba(33,201,139,.22)" : "rgba(240,80,99,.22)" })));
    const closes = candles.map((candle) => candle.close);
    const lineData = (values: (number | null)[]) => values.flatMap((value, index) => value === null ? [] : [{ time: time(candles[index].timestamp), value }]);
    ema9Series.current?.setData(lineData(ema(closes, 9)));
    ema21Series.current?.setData(lineData(ema(closes, 21)));
    ema50Series.current?.setData(lineData(ema(closes, 50)));
    vwapSeries.current?.setData(lineData(vwap(candles)));
    planLines.current.forEach((line) => candleSeries.current?.removePriceLine(line));
    planLines.current = [];
    const plan = analysis.setupLifecycle.plan ?? analysis.tradePlan;
    if (plan && candleSeries.current) {
      const add = (price: number, title: string, color: string, lineStyle = 2) => {
        planLines.current.push(candleSeries.current!.createPriceLine({ price, title, color, lineWidth: 1, lineStyle, axisLabelVisible: true }));
      };
      add((plan.entryLow + plan.entryHigh) / 2, "ENTRY", "#5b94ff");
      add(plan.invalidation, "STOP", "#f05467", 0);
      add(plan.target1, "T1", "#24cf91", 0);
      add(plan.target2, "T2", "#56d9ac");
    }
    chart.current?.timeScale().fitContent();
  }, [analysis, timeframe]);

  return <div ref={container} className="h-[430px] w-full" aria-label={`${analysis.instrument.displayName} ${timeframe} candlestick chart`} />;
}
