export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatPrice(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatIst(timestamp: number | null | undefined, includeDate = false) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(includeDate ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(timestamp);
}
