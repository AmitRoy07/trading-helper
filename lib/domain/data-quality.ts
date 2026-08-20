export function isFeedStale(lastTickAt: number | null, now: number, staleAfterMs: number): boolean {
  return lastTickAt !== null && staleAfterMs > 0 && now - lastTickAt > staleAfterMs;
}

export function reconnectBackoffMs(attempt: number, jitterMs = 0): number {
  return Math.min(30_000, 1_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 5)) + Math.max(0, jitterMs);
}

