"use strict";

const { mkdirSync } = require("node:fs");
const { dirname } = require("node:path");

const schema = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    salt TEXT NOT NULL, password_hash TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
    expires_at INTEGER NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS walks (
    id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
    share_token TEXT NOT NULL UNIQUE, started_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL, arrived_at INTEGER, revoked_at INTEGER
  ) STRICT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS one_active_walk
    ON walks(account_id) WHERE arrived_at IS NULL AND revoked_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
    type TEXT NOT NULL, place TEXT NOT NULL, created_at INTEGER NOT NULL, lat REAL, lon REAL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS confirmations (
    report_id INTEGER NOT NULL REFERENCES reports(id), account_id INTEGER NOT NULL REFERENCES accounts(id),
    PRIMARY KEY (report_id, account_id)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS havens (
    id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
    name TEXT NOT NULL, type TEXT NOT NULL, place TEXT NOT NULL, lat REAL, lon REAL
  ) STRICT`
];

function sqlite(database) {
  const { DatabaseSync } = require("node:sqlite");
  if (database !== ":memory:") mkdirSync(dirname(database), { recursive: true });
  const db = new DatabaseSync(database);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON");
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const sql of schema) db.exec(sql);
      for (const table of ["reports", "havens"]) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all();
        for (const name of ["lat", "lon"]) {
          if (!columns.some(column => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} REAL`);
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    db.close();
    throw error;
  }
  return {
    get: (sql, ...args) => db.prepare(sql).get(...args),
    all: (sql, ...args) => db.prepare(sql).all(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),
    close: () => db.close()
  };
}

function hosted(client) {
  let ready;
  async function execute(sql, args) {
    ready ??= client.batch(schema, "write").catch(error => {
      ready = undefined;
      throw error;
    });
    try {
      await ready;
      return await client.execute({ sql, args });
    } catch (error) {
      // Log only the provider error code, which omits connection credentials and SQL values.
      console.error("Hosted database request failed.", error.code ?? error.name);
      throw new StorageUnavailable();
    }
  }
  return {
    get: async (sql, ...args) => (await execute(sql, args)).rows[0],
    all: async (sql, ...args) => (await execute(sql, args)).rows,
    run: (sql, ...args) => execute(sql, args),
    close: () => client.close()
  };
}

class StorageUnavailable extends Error {}

function unavailable() {
  function fail() { throw new StorageUnavailable(); }
  return { get: fail, all: fail, run: fail, close() {} };
}

module.exports = { sqlite, hosted, unavailable, StorageUnavailable };
