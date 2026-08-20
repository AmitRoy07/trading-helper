# Market Pulse

Market Pulse is a local-first Indian intraday decision-support workstation for MCX Gold Mini futures (`GOLDM`), NIFTY 50, and SENSEX. It consumes Upstox Market Data Feed V3 through a private Node service, builds intraday candles, runs deterministic technical/structure analysis, and sends normalized snapshots to the local Next.js UI.

It has no order placement, modification, cancellation, positions, holdings, or portfolio code. It is an analysis terminal, not a trading bot.

## What is implemented

- Current Upstox Market Data Feed V3 authorization, binary subscription, official V3 Protobuf decoding, redirect support, reconnect/backoff, and resubscription.
- Official Upstox BOD JSON instrument masters with exact NIFTY 50 and SENSEX matching and dynamic, expiry-sorted GOLDM resolution.
- Manual GOLDM expiry selection persisted locally.
- Current and historical V3 candle backfill plus live tick aggregation for `1m`, `3m`, `5m`, `15m`, `30m`, and `1h`.
- Duplicate, out-of-order, invalid price, future timestamp, and stale-feed protections.
- EMA 9/21/50, RSI 14, MACD 12/26/9, VWAP, ATR 14, Bollinger 20/2, relative volume, and OI where actually supplied.
- Current-expiry OI put/call ratio for NIFTY 50 and SENSEX, aggregated from the official Upstox option chain and refreshed once per minute. MCX/GOLDM displays `N/A` because Upstox does not provide its option chain.
- Swing/market-structure detection, ATR-relative support/resistance clustering, opening range primitives, market regime classification, configurable confluence scoring, and structure/ATR-derived hypothetical trade plans.
- Terminal dashboard, Lightweight Charts candlesticks/volume/overlays, settings, diagnostics, cross-market matrix, browser alerts, and persistent signal journal.
- Tick-driven long/short setup lifecycle: watching, ready, active, target hit, or invalidated; active plans freeze their entry, stop, and target levels on the live chart.
- SQLite persistence through `sql.js` (WebAssembly SQLite), avoiding a native compiler requirement on Windows.
- Deterministic seeded simulator that is always labelled `SIMULATION DATA`.

## Architecture

```text
Upstox Market Data Feed V3 (secret stays here)
                    │ Protobuf
                    ▼
services/market-data
  provider → validation → candle engine → analysis → SQLite
                    │ normalized JSON snapshots
                    ▼
           ws://127.0.0.1:8787/stream
                    │
                    ▼
Next.js 16 App Router UI at http://localhost:3000
```

The browser never receives `UPSTOX_ACCESS_TOKEN`. The UI only connects to the loopback market-data service. Provider-independent domain types are shared across the service and UI; future providers must implement `MarketDataProvider` and cannot leak provider payloads into the analysis layer.

### Important directories

```text
app/                         Next.js routes and terminal styling
components/terminal/         Dashboard, chart, settings, diagnostics
components/ui/               Small shadcn-style UI primitives
config/                      Strategy weights and exchange sessions
lib/domain/                  Pure indicators, candles, structure, levels, risk
services/market-data/
  providers/                 Upstox V3, simulator, future provider contracts
  instruments/               Official master loader and GOLDM resolver
  proto/                     Official Upstox MarketDataFeed.proto schema
  persistence/               Local SQLite repository
tests/                       Deterministic unit tests
data/                        Runtime database (ignored by Git)
```

## Requirements

- Node.js 20.9 or newer
- pnpm 10 or newer
- An Upstox account and Developer access
- A read-only Upstox Analytics Token for live mode

## Installation

```bash
pnpm install
cp .env.example .env.local
```

On PowerShell, use:

```powershell
Copy-Item .env.example .env.local
```

If PowerShell blocks the `pnpm.ps1` shim, use `pnpm.cmd` for the same commands.

## Environment variables

```dotenv
# upstox | simulation
MARKET_DATA_PROVIDER=upstox

# Server-side only. Never use a NEXT_PUBLIC_ prefix.
UPSTOX_ACCESS_TOKEN=your_read_only_analytics_token

MARKET_DATA_PORT=8787
MARKET_DATA_STALE_AFTER_MS=15000
DATABASE_PATH=./data/market-pulse.sqlite
```

`.env.local` and `data/` are ignored. Secrets are never stored in SQLite.

## Run locally

```bash
pnpm dev
```

One command starts:

- Web terminal: <http://localhost:3000>
- Local feed WebSocket: `ws://127.0.0.1:8787/stream`
- Local health endpoint: <http://127.0.0.1:8787/health>

Use `MARKET_DATA_PROVIDER=simulation` for repeatable UI development. The header and banner will say `SIMULATION DATA`; simulation is never represented as live.

## Vercel deployment

The Next.js interface can be deployed to Vercel. Vercel builds use the standard `.next` output directory; local Windows builds retain `.next-build` to avoid development-cache collisions.

The market-data service is a separate, stateful Node process and is not started by a Vercel Next.js deployment. The current browser client intentionally connects to `127.0.0.1:8787`, so a hosted interface will remain disconnected until the feed service is deployed to a suitable Node host and the client transport is configured for that public HTTPS/WSS endpoint. Never add the Upstox token to a `NEXT_PUBLIC_` variable.

## Upstox setup

1. Open the Upstox Developer Apps page and generate an Analytics Token from the Analytics tab.
2. Copy `.env.example` to `.env.local`.
3. Set `MARKET_DATA_PROVIDER=upstox`.
4. Put the token only in `UPSTOX_ACCESS_TOKEN`.
5. Run `pnpm dev` and open <http://localhost:3000>.
6. Confirm the header shows `LIVE`, not `SIMULATION`, and diagnostics shows all three subscriptions.
7. Confirm the resolved GOLDM trading symbol and expiry match the current Upstox master.

Upstox currently documents Analytics Tokens as read-only, valid for one year, and compatible with Market Data Feed V3. Market-data APIs do not require the static IP restriction applied to account-specific API categories. See the official [Analytics Token documentation](https://upstox.com/developer/api-documentation/analytics-token/).

## Verified Upstox decisions (20 August 2026)

- V3 only: the older Market Data Feed V2 is discontinued. V3 uses binary subscriptions and the [official V3 Protobuf schema](https://assets.upstox.com/feed/market-data-feed/v3/MarketDataFeed.proto).
- The service requests a one-use socket URL from `GET /v3/feed/market-data-feed/authorize`, then opens it with redirect support. See [Market Data Feed Authorize V3](https://upstox.com/developer/api-documentation/get-market-data-feed-authorize-v3/).
- The feed subscribes in `full` mode, which provides LTPC, five levels, metadata, volume, OI where supported, and OHLC. Normal-account limits documented by Upstox are two connections and up to 2,000 instruments in full mode; this application uses one connection and three subscriptions. See [Market Data Feed V3](https://upstox.com/developer/api-documentation/v3/get-market-data-feed/).
- Official JSON instrument masters are used instead of deprecated CSV. `instrument_key` is canonical because exchange tokens may be reused after expiry. See [Upstox instruments](https://upstox.com/developer/api-documentation/instruments/).
- The current official master resolved `NSE_INDEX|Nifty 50`, `BSE_INDEX|SENSEX`, and `GOLDM FUT 04 SEP 26` as the nearest unexpired GOLDM contract on the verification date. These values are observations, not permanent hard-coded IDs.
- Intraday and dated backfill use [Historical Candle Data V3](https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/).
- NIFTY and SENSEX OI PCR uses the [Put/Call Option Chain API](https://upstox.com/developer/api-documentation/get-pc-option-chain/) and is calculated as total put OI divided by total call OI across the returned current expiry.

## Market sessions

All internal timestamps are epoch milliseconds and all displayed/session logic uses `Asia/Kolkata`. NSE/BSE normal index sessions are configured for 09:15–15:30 after the pre-open session. GOLDM uses the MCX bullion session, 09:00–23:30 during US daylight saving time and 09:00–23:55 outside it.

The live Upstox V3 `market_info.segmentStatus` message is the intended authoritative source for exceptional sessions. Static session configuration is isolated in `config/marketSessions.ts`; holiday/special-session data is not guessed. Official references: [NSE market timings](https://www.nseindia.com/static/market-data/market-timings), [BSE session timings](https://www.bseindia.com/markets/equity/session_timings_sp.aspx), and [MCX trading and surveillance](https://www.mcxindia.com/market-operations/trading-surveillance).

## Quality commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The test suite covers indicator edge cases, zero volume, candle aggregation and rollover, duplicate/out-of-order ticks, swing/structure detection, ATR-relative level clustering, confluence, risk/reward, opening range, stale feed/backoff, PCR aggregation, and expired GOLDM contracts.

## Troubleshooting

### `LIVE DATA DISCONNECTED`

The token is missing. This is deliberate: live mode never falls back to simulated prices. Set `UPSTOX_ACCESS_TOKEN` or explicitly select simulation.

### Invalid token / 401

Generate a new read-only Analytics Token, replace the local value, and use **Test / reconnect** in Settings. The token is redacted from logs and diagnostics.

### No ticks outside market hours

Check the exchange status and last-tick time in Diagnostics. Closed markets legitimately have no new ticks. MCX has a longer bullion session than NSE/BSE.

### `STALE` / signals paused

No tick arrived within `MARKET_DATA_STALE_AFTER_MS`. The engine refuses to generate a fresh assessment until a valid tick returns. Check network access, Upstox status, token validity, and the exchange session.

### GOLDM contract not found or expired

The service reloads the official MCX master on restart and selects the nearest unexpired `MCX_FO`/`FUT` row whose underlying or asset symbol is exactly `GOLDM`. Restart to force a new master load; then inspect available expiries in Settings.

### Protobuf decode failure

Confirm the checked-in `MarketDataFeed.proto` still matches the official V3 schema linked above. Invalid frames are logged without crashing or exposing credentials.

### Port already in use

Stop the other local service or change `MARKET_DATA_PORT`. The current browser client expects port 8787; keep that value for v1.

## Known limitations

- A real Upstox connection cannot be validated without the user’s private token. Simulation, instrument masters, persistence, HTTP pages, build, and disconnected-live behavior can be validated without it.
- Upstox index feeds may not provide traded volume; VWAP/relative-volume then render `N/A` rather than being fabricated.
- Holiday calendars and special sessions are not bundled. The live V3 market status is authoritative; offline session state is only a weekday/time estimate.
- Alerts currently cover signal transitions, stale data, and connection state. The engine is structured for additional threshold/crossover alert classes.
- This local v1 intentionally has no remote deployment/authentication model and no order execution module.

## Recommended next improvements

1. Add a local worker for persisted candle-cache gap repair across restarts.
2. Add exchange holiday calendar adapters with signed/official sources.
3. Add alert-rule editing and a complete alert-history screen.
4. Add measured strategy evaluation/backtesting before presenting any statistical outcome claims.
5. Add optional, separately sourced XAU/USD, USD/INR, DXY, and US-yield inputs without coupling them to GOLDM execution logic.

Market analysis is for informational and educational purposes only. It is not investment advice and does not guarantee trading outcomes.
