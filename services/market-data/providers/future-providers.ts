import type { MarketDataProvider } from "./market-data-provider";

// Intentionally type-only extension points. No credentials, trading methods, or partial
// integrations are shipped for these future providers in v1.
export interface FyersMarketDataProvider extends MarketDataProvider { readonly name: never }
export interface AngelOneMarketDataProvider extends MarketDataProvider { readonly name: never }

