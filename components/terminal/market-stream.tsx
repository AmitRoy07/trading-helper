"use client";

import { useEffect } from "react";
import { useMarketStore } from "@/lib/client/market-store";
import type { TerminalSnapshot } from "@/lib/domain/types";

export function MarketStream() {
  const setSnapshot = useMarketStore((state) => state.setSnapshot);
  const setConnected = useMarketStore((state) => state.setTransportConnected);
  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket("ws://127.0.0.1:8787/stream");
      socket.onopen = () => { attempt = 0; setConnected(true); };
      socket.onmessage = (event) => {
        try {
          const value: unknown = JSON.parse(String(event.data));
          if (typeof value === "object" && value !== null && (value as { type?: string }).type === "snapshot") setSnapshot(value as TerminalSnapshot);
        } catch { /* Invalid local frames are ignored. */ }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) { const delay = Math.min(10_000, 500 * 2 ** attempt++); retry = setTimeout(connect, delay); }
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => { disposed = true; if (retry) clearTimeout(retry); socket?.close(); };
  }, [setConnected, setSnapshot]);
  return null;
}
