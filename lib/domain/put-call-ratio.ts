import type { PutCallRatio } from "@/lib/domain/types";

export type OptionChainOiRow = {
  callOi: number | null | undefined;
  putOi: number | null | undefined;
};

export const unavailablePutCallRatio = (): PutCallRatio => ({
  oi: null,
  totalPutOi: null,
  totalCallOi: null,
  expiry: null,
  updatedAt: null,
  source: "UNAVAILABLE",
});

export function aggregateOptionChainOi(
  rows: OptionChainOiRow[],
  expiry: string | null,
  updatedAt = Date.now(),
): PutCallRatio {
  const validCallOi = rows.map((row) => row.callOi).filter(validOi);
  const validPutOi = rows.map((row) => row.putOi).filter(validOi);
  if (validCallOi.length === 0 || validPutOi.length === 0) return unavailablePutCallRatio();

  const totalCallOi = validCallOi.reduce((sum, value) => sum + value, 0);
  const totalPutOi = validPutOi.reduce((sum, value) => sum + value, 0);
  if (totalCallOi <= 0) return unavailablePutCallRatio();

  return {
    oi: totalPutOi / totalCallOi,
    totalPutOi,
    totalCallOi,
    expiry,
    updatedAt,
    source: "UPSTOX_OPTION_CHAIN",
  };
}

function validOi(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
