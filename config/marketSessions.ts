import type { Exchange } from "@/lib/domain/types";

export const MARKET_TIMEZONE = "Asia/Kolkata";

// Session values are isolated configuration, not analysis logic. Exchange status from
// Upstox V3 remains authoritative for live mode; holidays require the live status feed.
export const marketSessions: Record<Exchange, { open: string; close: string; preOpen?: string; closeOutsideUsDst?: string }> = {
  NSE: { preOpen: "09:00", open: "09:15", close: "15:30" },
  BSE: { preOpen: "09:00", open: "09:15", close: "15:30" },
  MCX: { open: "09:00", close: "23:30", closeOutsideUsDst: "23:55" },
};

function minutesAtIst(timestamp: number): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MARKET_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { day: weekdays[value("weekday")] ?? 7, minutes: Number(value("hour")) * 60 + Number(value("minute")) };
}

const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

export function inferSessionState(exchange: Exchange, timestamp = Date.now()) {
  const now = minutesAtIst(timestamp);
  if (now.day > 5) return "CLOSED" as const;
  const session = marketSessions[exchange];
  const close = exchange === "MCX" && session.closeOutsideUsDst && !isUsDaylightSaving(timestamp)
    ? session.closeOutsideUsDst
    : session.close;
  if (session.preOpen && now.minutes >= toMinutes(session.preOpen) && now.minutes < toMinutes(session.open)) {
    return "PRE_OPEN" as const;
  }
  return now.minutes >= toMinutes(session.open) && now.minutes <= toMinutes(close)
    ? ("OPEN" as const)
    : ("CLOSED" as const);
}

function isUsDaylightSaving(timestamp: number): boolean {
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(timestamp).find((part) => part.type === "timeZoneName")?.value;
  return offset === "GMT-4";
}
