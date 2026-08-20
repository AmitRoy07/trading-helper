import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import type { MarketAnalysis, Timeframe } from "@/lib/domain/types";

export type SignalRow = {
  id: number; timestamp: number; instrument_key: string; symbol: string; timeframe: string;
  direction: string; confluence_score: number; setup_quality: string; entry_low: number | null;
  entry_high: number | null; stop: number | null; target_1: number | null; target_2: number | null;
  risk_reward: number | null; market_regime: string; reasons_json: string; price_at_signal: number;
};

export class MarketDatabase {
  private constructor(private readonly db: Database, private readonly filename: string) { this.migrate(); }

  static async open(filename: string): Promise<MarketDatabase> {
    const resolved = path.resolve(filename);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const existing = fs.existsSync(resolved) ? fs.readFileSync(resolved) : undefined;
    return new MarketDatabase(existing ? new SQL.Database(existing) : new SQL.Database(), resolved);
  }

  close() { this.persist(); this.db.close(); }
  ping() { return this.db.exec("SELECT 1 AS ok").length === 1; }

  getSetting<T>(key: string, fallback: T): T {
    const rows = this.query<{ value_json: string }>("SELECT value_json FROM settings WHERE key = ?", [key]);
    if (!rows[0]) return fallback;
    try { return JSON.parse(rows[0].value_json) as T; } catch { return fallback; }
  }

  setSetting(key: string, value: unknown) {
    this.run(`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), Date.now()]);
  }

  saveSignal(analysis: MarketAnalysis, timeframe: Timeframe) {
    const plan = analysis.tradePlan;
    this.run(`INSERT INTO signals (
      timestamp, instrument_key, symbol, timeframe, direction, confluence_score, setup_quality,
      entry_low, entry_high, stop, target_1, target_2, risk_reward, market_regime, reasons_json, price_at_signal
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Date.now(), analysis.instrument.instrumentKey, analysis.instrument.symbol, timeframe,
        analysis.signal.direction, analysis.signal.score, analysis.signal.quality,
        plan?.entryLow ?? null, plan?.entryHigh ?? null, plan?.invalidation ?? null,
        plan?.target1 ?? null, plan?.target2 ?? null, plan?.riskReward ?? null,
        analysis.regime, JSON.stringify(analysis.signal.reasons), analysis.tick.ltp]);
  }

  listSignals(limit = 200): SignalRow[] {
    return this.query<SignalRow>("SELECT * FROM signals ORDER BY timestamp DESC LIMIT ?", [limit]);
  }

  saveAlert(kind: string, instrumentKey: string | null, message: string) {
    this.run("INSERT INTO alerts (timestamp, kind, instrument_key, message) VALUES (?, ?, ?, ?)", [Date.now(), kind, instrumentKey, message]);
  }

  private run(sql: string, params: SqlValue[] = []) { this.db.run(sql, params); this.persist(); }
  private query<T extends object>(sql: string, params: SqlValue[] = []): T[] {
    const statement = this.db.prepare(sql);
    statement.bind(params);
    const rows: T[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as T);
    statement.free();
    return rows;
  }
  private persist() { fs.writeFileSync(this.filename, Buffer.from(this.db.export())); }
  private migrate() {
    this.db.run(`
      PRAGMA journal_mode = MEMORY;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL, instrument_key TEXT NOT NULL,
        symbol TEXT NOT NULL, timeframe TEXT NOT NULL, direction TEXT NOT NULL, confluence_score INTEGER NOT NULL,
        setup_quality TEXT NOT NULL, entry_low REAL, entry_high REAL, stop REAL, target_1 REAL, target_2 REAL,
        risk_reward REAL, market_regime TEXT NOT NULL, reasons_json TEXT NOT NULL, price_at_signal REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS signals_time_symbol ON signals(timestamp DESC, symbol);
      CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL, kind TEXT NOT NULL, instrument_key TEXT, message TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS candle_cache (
        instrument_key TEXT NOT NULL, timeframe TEXT NOT NULL, timestamp INTEGER NOT NULL,
        o REAL NOT NULL, h REAL NOT NULL, l REAL NOT NULL, c REAL NOT NULL, volume REAL NOT NULL,
        open_interest REAL, PRIMARY KEY(instrument_key, timeframe, timestamp)
      );
    `);
    this.persist();
  }
}

