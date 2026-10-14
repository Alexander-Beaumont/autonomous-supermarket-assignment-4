import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'supermarket.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let BetterSqlite = null;
let BuiltInDatabaseSync = null;
try {
  BetterSqlite = (await import('better-sqlite3')).default;
} catch {
  try {
    BuiltInDatabaseSync = (await import('node:sqlite')).DatabaseSync;
  } catch {
    throw new Error('No SQLite driver is available. Use Node.js 22.5+ (built-in node:sqlite) or install the optional better-sqlite3 driver.');
  }
}

class DatabaseAdapter {
  constructor(dbPath) {
    this.raw = BetterSqlite ? new BetterSqlite(dbPath) : new BuiltInDatabaseSync(dbPath);
    this.raw.exec('PRAGMA foreign_keys = ON;');
    this.raw.exec('PRAGMA journal_mode = WAL;');
    this.raw.exec('PRAGMA synchronous = NORMAL;');
  }

  prepare(sql) { return this.raw.prepare(sql); }
  exec(sql) { return this.raw.exec(sql); }
  close() { return this.raw.close(); }

  transaction(fn) {
    if (BetterSqlite && typeof this.raw.transaction === 'function') {
      return this.raw.transaction(fn);
    }
    return (...args) => {
      this.raw.exec('BEGIN IMMEDIATE;');
      try {
        const value = fn(...args);
        this.raw.exec('COMMIT;');
        return value;
      } catch (error) {
        try { this.raw.exec('ROLLBACK;'); } catch {}
        throw error;
      }
    };
  }
}

export function openDatabase(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return new DatabaseAdapter(dbPath);
}

export function initializeSchema(db) {
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

export function withDatabase(fn, dbPath) {
  const db = openDatabase(dbPath);
  try {
    initializeSchema(db);
    return fn(db);
  } finally {
    db.close();
  }
}

export { DEFAULT_DB_PATH };
