"use client";

import { ChevronDown } from "lucide-react";
import { useMarketStore } from "@/lib/client/market-store";
import { cn, formatPrice } from "@/lib/utils";

const SYMBOLS = ["GOLDM", "NIFTY", "SENSEX"] as const;

export function MarketStrip() {
  const markets = useMarketStore((state) => state.snapshot?.markets);
  const selected = useMarketStore((state) => state.selectedSymbol);
  const select = useMarketStore((state) => state.setSelectedSymbol);
  return (
    <nav className="market-strip" aria-label="Market selector">
      {SYMBOLS.map((symbol) => {
        const market = markets?.[symbol];
        const positive = (market?.change ?? 0) >= 0;
        return (
          <button key={symbol} className={cn("market-tile", selected === symbol && "active")} onClick={() => select(symbol)}>
            <div className="flex items-center justify-between"><span className="market-symbol">{symbol === "NIFTY" ? "NIFTY 50" : symbol}</span><span className={cn("trend-pill", market?.signal.direction.includes("LONG") ? "bull" : market?.signal.direction.includes("SHORT") ? "bear" : "neutral")}>{market?.signal.direction ?? "WAIT"}</span></div>
            <div className="mt-2 flex items-end justify-between gap-4"><span className="market-price">{formatPrice(market?.tick.ltp)}</span><span className={positive ? "positive" : "negative"}>{positive ? "+" : ""}{formatPrice(market?.change)} <small>{positive ? "+" : ""}{market?.changePercent.toFixed(2) ?? "0.00"}%</small></span></div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600"><span>{market?.regime ?? "AWAITING DATA"}</span>{symbol === "GOLDM" && <span className="flex items-center">{market?.instrument.displayName ?? "RESOLVING CONTRACT"}<ChevronDown size={11} /></span>}</div>
          </button>
        );
      })}
    </nav>
  );
}

