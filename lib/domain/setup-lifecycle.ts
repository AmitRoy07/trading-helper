import type { SetupLifecycle, SignalAssessment, TradePlan } from "./types";

export type SetupLifecycleInput = {
  price: number;
  tickTimestamp: number;
  signal: SignalAssessment;
  candidatePlan: TradePlan;
  dataUsable: boolean;
};

export function initialSetupLifecycle(now = 0): SetupLifecycle {
  return {
    stage: "NO SETUP",
    direction: null,
    plan: null,
    startedAt: null,
    updatedAt: now,
    lastProcessedTick: 0,
    note: "Waiting for directional confluence",
  };
}

export function advanceSetupLifecycle(
  previous: SetupLifecycle,
  input: SetupLifecycleInput,
): SetupLifecycle {
  if (input.tickTimestamp <= previous.lastProcessedTick) return previous;
  const base = { ...previous, lastProcessedTick: input.tickTimestamp };
  if (!input.dataUsable) {
    return reset(base, input, "Signals paused — market data is stale or disconnected");
  }

  if (previous.stage === "TARGET HIT" || previous.stage === "INVALIDATED") {
    if (input.tickTimestamp - previous.updatedAt < 5 * 60_000) return base;
    return beginWatchingOrReset(base, input);
  }

  if (previous.stage === "LONG ACTIVE" || previous.stage === "SHORT ACTIVE") {
    const plan = previous.plan;
    if (!plan) return reset(base, input, "Active setup lost its frozen trade plan");
    const long = previous.direction === "LONG";
    const invalidated = long ? input.price <= plan.invalidation : input.price >= plan.invalidation;
    const targetHit = long ? input.price >= plan.target1 : input.price <= plan.target1;
    if (invalidated) return complete(base, input, "INVALIDATED", "Price crossed the frozen invalidation level");
    if (targetHit) return complete(base, input, "TARGET HIT", "Target 1 reached");
    return { ...base, note: `Active toward ${format(plan.target1)}; invalidation ${format(plan.invalidation)}` };
  }

  if (previous.stage === "LONG READY" || previous.stage === "SHORT READY") {
    const plan = previous.plan;
    if (!plan) return reset(base, input, "Ready setup has no valid plan");
    const long = previous.direction === "LONG";
    const remainsDirectional = long ? input.signal.score >= 2 : input.signal.score <= -2;
    if (!remainsDirectional) return reset(base, input, "Directional confluence faded before entry");
    if (input.price >= plan.entryLow && input.price <= plan.entryHigh) {
      return {
        ...base,
        stage: long ? "LONG ACTIVE" : "SHORT ACTIVE",
        updatedAt: input.tickTimestamp,
        note: `Entry zone touched at ${format(input.price)}`,
      };
    }
    return { ...base, note: `Waiting for entry ${format(plan.entryLow)}–${format(plan.entryHigh)}` };
  }

  if (previous.stage === "WATCHING LONG" || previous.stage === "WATCHING SHORT") {
    const long = previous.direction === "LONG";
    if ((long && input.signal.score <= -2) || (!long && input.signal.score >= 2)) {
      return beginWatchingOrReset(base, input);
    }
    if ((long && input.signal.score < 2) || (!long && input.signal.score > -2)) {
      return reset(base, input, "Directional confluence faded");
    }
    const matchingPlan = input.candidatePlan &&
      ((long && input.candidatePlan.bias.includes("LONG")) || (!long && input.candidatePlan.bias.includes("SHORT")));
    if (matchingPlan) {
      return {
        ...base,
        stage: long ? "LONG READY" : "SHORT READY",
        plan: input.candidatePlan,
        updatedAt: input.tickTimestamp,
        note: "Qualified plan created; waiting for entry-zone touch",
      };
    }
    return { ...base, note: "Watching confluence; plan quality or R:R not ready" };
  }

  return beginWatchingOrReset(base, input);
}

function beginWatchingOrReset(previous: SetupLifecycle, input: SetupLifecycleInput): SetupLifecycle {
  if (input.signal.score >= 2) {
    return {
      ...previous,
      stage: "WATCHING LONG",
      direction: "LONG",
      plan: null,
      startedAt: input.tickTimestamp,
      updatedAt: input.tickTimestamp,
      note: "Bullish confluence is developing",
    };
  }
  if (input.signal.score <= -2) {
    return {
      ...previous,
      stage: "WATCHING SHORT",
      direction: "SHORT",
      plan: null,
      startedAt: input.tickTimestamp,
      updatedAt: input.tickTimestamp,
      note: "Bearish confluence is developing",
    };
  }
  return reset(previous, input, "Waiting for directional confluence");
}

function reset(previous: SetupLifecycle, input: SetupLifecycleInput, note: string): SetupLifecycle {
  return {
    ...previous,
    stage: "NO SETUP",
    direction: null,
    plan: null,
    startedAt: null,
    updatedAt: input.tickTimestamp,
    note,
  };
}

function complete(
  previous: SetupLifecycle,
  input: SetupLifecycleInput,
  stage: "TARGET HIT" | "INVALIDATED",
  note: string,
): SetupLifecycle {
  return { ...previous, stage, updatedAt: input.tickTimestamp, note };
}

const format = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

