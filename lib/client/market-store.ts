"use client";

import { create } from "zustand";
import type { TerminalSnapshot, Timeframe } from "@/lib/domain/types";

type MarketStore = {
  snapshot: TerminalSnapshot | null;
  transportConnected: boolean;
  selectedSymbol: "GOLDM" | "NIFTY" | "SENSEX";
  timeframe: Timeframe;
  setSelectedSymbol: (symbol: MarketStore["selectedSymbol"]) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setSnapshot: (snapshot: TerminalSnapshot) => void;
  setTransportConnected: (connected: boolean) => void;
};

export const useMarketStore = create<MarketStore>((set) => ({
  snapshot: null,
  transportConnected: false,
  selectedSymbol: "GOLDM",
  timeframe: "5m",
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setTransportConnected: (transportConnected) => set({ transportConnected }),
}));
