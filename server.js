"use strict";

const { createServer } = require("node:http");
const { createHash, randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const { readFileSync, mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { places } = require("./routes");
const { createMapServices, coordinate, MapError } = require("./map-services");

const derive = promisify(scrypt);
const hour = 60 * 60 * 1000;
const sessionDuration = 7 * 24 * hour;
const cookie = "safestride_session";
const tokenPattern = /^[a-f0-9]{64}$/;
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/styles.css", ["styles.css", "text/css"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/street-map.js", ["street-map.js", "text/javascript"]],
  ["/check-in.js", ["check-in.js", "text/javascript"]]
]);
const reportTypes = ["Broken streetlight", "Blocked ramp", "Damaged pavement", "Other hazard"];
const havenTypes = ["Security desk", "Pharmacy", "Shop", "Other"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function text(value, limit) {
  return typeof value === "string" && value.length <= limit ? value.trim() : "";
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") {
    throw new HttpError(415, "Send a JSON request.");
  }
  let size = 0;
  const chunks = [];
  // Keep the connection available for the 413 response if the body exceeds the limit.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 4096) {
      req.resume();
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "Invalid request data.");
  }
}

function createApp({ database = ":memory:", now = Date.now, secureCookie = false, maps = createMapServices() } = {}) {
  if (database !== ":memory:") mkdirSync(dirname(database), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS walks (
      id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      share_token TEXT NOT NULL UNIQUE, started_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, arrived_at INTEGER, revoked_at INTEGER
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_walk
      ON walks(account_id) WHERE arrived_at IS NULL AND revoked_at IS NULL;
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      type TEXT NOT NULL, place TEXT NOT NULL, created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS confirmations (
      report_id INTEGER NOT NULL REFERENCES reports(id), account_id INTEGER NOT NULL REFERENCES accounts(id),
      PRIMARY KEY (report_id, account_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS havens (
      id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      name TEXT NOT NULL, type TEXT NOT NULL, place TEXT NOT NULL
    ) STRICT;
  `);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const table of ["reports", "havens"]) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      for (const name of ["lat", "lon"]) {
        if (!columns.some(column => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} REAL`);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }
  const attempts = new Map();

  function setSessionCookie(res, token, maxAge) {
    res.setHeader("Set-Cookie", `${cookie}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secureCookie ? "; Secure" : ""}`);
  }

  function sessionToken(req) {
    const part = req.headers.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith(cookie + "="));
    return part?.slice(cookie.length + 1) ?? "";
  }

  function account(req) {
    const token = sessionToken(req);
    if (!tokenPattern.test(token)) return null;
    return db.prepare(`
      SELECT accounts.id, accounts.display_name AS displayName FROM sessions
      JOIN accounts ON accounts.id = sessions.account_id WHERE token_hash = ? AND expires_at > ?
    `).get(hash(token), now()) ?? null;
  }

  async function authenticate(req, res, register) {
    const ip = req.socket.remoteAddress;
    const time = now();
    for (const [key, entry] of attempts) {
      if (entry.until <= time) attempts.delete(key);
    }
    if (!attempts.has(ip) && attempts.size >= 4096) throw new HttpError(429, "Try again later.");
    const entry = attempts.get(ip) ?? { count: 0, until: time + 15 * 60 * 1000 };
    if (++entry.count > 20) throw new HttpError(429, "Too many sign-in attempts. Try again later.");
    attempts.set(ip, entry);

    const body = await readJson(req);
    const username = text(body.username, 32).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const displayName = text(body.displayName, 40);
    if (!/^[a-z0-9_.-]{3,32}$/.test(username) || password.length < 10 || password.length > 128) {
      throw new HttpError(400, "Use a 3–32 character username and a 10–128 character password.");
    }
    let user = db.prepare("SELECT * FROM accounts WHERE username = ?").get(username);
    if (register) {
      if (!displayName) throw new HttpError(400, "Enter a display name.");
      const salt = randomBytes(16).toString("hex");
      const passwordHash = (await derive(password, salt, 64)).toString("hex");
      user = db.prepare(`
        INSERT INTO accounts (username, display_name, salt, password_hash) VALUES (?, ?, ?, ?)
        ON CONFLICT(username) DO NOTHING RETURNING *
      `).get(username, displayName, salt, passwordHash);
      if (!user) throw new HttpError(409, "That username is already in use.");
    } else {
      const expected = Buffer.from(user?.password_hash ?? "0".repeat(128), "hex");
      const candidate = await derive(password, user?.salt ?? "0".repeat(32), 64);
      if (!timingSafeEqual(candidate, expected) || !user) throw new HttpError(401, "Username or password is incorrect.");
    }
    if (tokenPattern.test(sessionToken(req))) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(sessionToken(req)));
    }
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(hash(token), user.id, now() + sessionDuration);
    setSessionCookie(res, token, sessionDuration / 1000);
    json(res, register ? 201 : 200, { account: { id: user.id, displayName: user.display_name } });
  }

  function publicWalk(row) {
    return {
      status: row.arrived_at !== null ? "arrived" : now() >= row.due_at ? "overdue" : "walking",
      dueAt: row.due_at,
      arrivedAt: row.arrived_at
    };
  }

  function latestWalk(id) {
    const row = db.prepare("SELECT * FROM walks WHERE account_id = ? ORDER BY id DESC LIMIT 1").get(id);
    return row && row.revoked_at === null && row.expires_at > now() ? row : null;
  }

  function ownerWalk(row) {
    return row ? { ...publicWalk(row), id: row.id, token: row.share_token, expiresAt: row.expires_at } : null;
  }

  function communityLocation(row) {
    const { place, ...entry } = row;
    const landmark = places[place];
    return { ...entry, lat: entry.lat ?? landmark?.lat, lon: entry.lon ?? landmark?.lon, landmark: landmark?.name };
  }

  async function handle(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://fonts.googleapis.com https://cdn.jsdelivr.net; img-src 'self' data: https://tile.openstreetmap.org https://cdn.jsdelivr.net; font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      const get = req.method === "GET";
      const post = req.method === "POST";
      if (get && files.has(path)) {
        const [file, contentType] = files.get(path);
        res.writeHead(200, { "Content-Type": contentType + "; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(readFileSync(join(__dirname, file)));
        return;
      }
      if (!path.startsWith("/api/")) throw new HttpError(404, "Page not found.");
      if (post) {
        const origin = req.headers.origin;
        if (req.headers["sec-fetch-site"] === "cross-site" ||
            (origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(origin))) {
          throw new HttpError(403, "Request denied.");
        }
      }
      if (post && path === "/api/register") return await authenticate(req, res, true);
      if (post && path === "/api/login") return await authenticate(req, res, false);
      if (post && path === "/api/map/search") return json(res, 200, { results: await maps.search(await readJson(req)) });
      if (post && path === "/api/map/walk") return json(res, 200, { routes: await maps.walking(await readJson(req)) });
      const user = account(req);
      if (get && path === "/api/session") return json(res, 200, { account: user });
      if (get && path === "/api/community") {
        const reports = db.prepare(`
          SELECT r.id, r.type, r.place, r.lat, r.lon, r.created_at AS createdAt,
            (r.account_id = ?) AS own, COUNT(c.account_id) AS confirmations,
            COALESCE(MAX(c.account_id = ?), 0) AS confirmed
          FROM reports r LEFT JOIN confirmations c ON r.id = c.report_id GROUP BY r.id ORDER BY r.id DESC
        `).all(user?.id ?? 0, user?.id ?? 0);
        const havens = db.prepare("SELECT id, name, type, place, lat, lon FROM havens ORDER BY id DESC").all();
        return json(res, 200, { reports: reports.map(communityLocation), havens: havens.map(communityLocation) });
      }
      if (get && path === "/api/contact") {
        const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
        const row = tokenPattern.test(token) && db.prepare(`
          SELECT walks.*, accounts.display_name FROM walks JOIN accounts ON accounts.id = walks.account_id
          WHERE share_token = ? AND revoked_at IS NULL AND walks.expires_at > ?
        `).get(token, now());
        if (!row) throw new HttpError(404, "This check-in link has expired or was closed.");
        return json(res, 200, { ...publicWalk(row), displayName: row.display_name });
      }
      if (!user) throw new HttpError(401, "Sign in to continue.");
      if (post && path === "/api/logout") {
        db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(sessionToken(req)));
        setSessionCookie(res, "", 0);
        return json(res, 200, {});
      }
      if (get && path === "/api/walk") return json(res, 200, { walk: ownerWalk(latestWalk(user.id)) });
      if (post && path === "/api/walk") {
        const { minutes } = await readJson(req);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
          throw new HttpError(400, "Choose an ETA from 1 to 180 minutes.");
        }
        const time = now();
        db.prepare("DELETE FROM walks WHERE expires_at <= ?").run(time);
        const due = time + minutes * 60 * 1000;
        const row = db.prepare(`
          INSERT INTO walks (account_id, share_token, started_at, due_at, expires_at)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING *
        `).get(user.id, randomBytes(32).toString("hex"), time, due, due + 24 * hour);
        if (!row) throw new HttpError(409, "Finish or close your current walk before starting another.");
        return json(res, 201, { walk: ownerWalk(row) });
      }
      const walkAction = /^\/api\/walk\/(\d+)\/(arrive|close)$/.exec(path);
      if (post && walkAction) {
        const id = Number(walkAction[1]);
        const time = now();
        const row = db.prepare("SELECT * FROM walks WHERE id = ? AND account_id = ? AND expires_at > ?")
          .get(id, user.id, time);
        if (!row) throw new HttpError(404, "Walk not found.");
        if (walkAction[2] === "close") {
          db.prepare("UPDATE walks SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").run(time, id);
          return json(res, 200, { walk: null });
        }
        if (row.revoked_at !== null) throw new HttpError(409, "This walk is closed.");
        const arrived = db.prepare("UPDATE walks SET arrived_at = COALESCE(arrived_at, ?) WHERE id = ? RETURNING *")
          .get(time, id);
        return json(res, 200, { walk: ownerWalk(arrived) });
      }
      if (post && (path === "/api/reports" || path === "/api/havens")) {
        const { type, place, lat, lon, name: rawName } = await readJson(req);
        const report = path === "/api/reports";
        const legacy = typeof place === "string" && Object.hasOwn(places, place);
        const pinned = coordinate({ lat, lon });
        if ((!pinned && !legacy) || !(report ? reportTypes : havenTypes).includes(type)) throw new HttpError(400, "Choose a category and a valid map point.");
        const position = pinned ? ["", lat, lon] : [place, null, null];
        if (report) {
          db.prepare("INSERT INTO reports (account_id, type, created_at, place, lat, lon) VALUES (?, ?, ?, ?, ?, ?)")
            .run(user.id, type, now(), ...position);
        } else {
          const name = text(rawName, 70);
          if (!name) throw new HttpError(400, "Enter a haven name.");
          db.prepare("INSERT INTO havens (account_id, name, type, place, lat, lon) VALUES (?, ?, ?, ?, ?, ?)").run(user.id, name, type, ...position);
        }
        return json(res, 201, {});
      }
      const confirmation = /^\/api\/reports\/(\d+)\/confirm$/.exec(path);
      if (post && confirmation) {
        const id = Number(confirmation[1]);
        const report = db.prepare("SELECT account_id FROM reports WHERE id = ?").get(id);
        if (!report) throw new HttpError(404, "Report not found.");
        if (report.account_id === user.id) throw new HttpError(409, "Another account must confirm your report.");
        db.prepare("INSERT INTO confirmations VALUES (?, ?) ON CONFLICT DO NOTHING").run(id, user.id);
        return json(res, 200, {});
      }
      throw new HttpError(404, "Page not found.");
    } catch (error) {
      if (!(error instanceof HttpError || error instanceof MapError)) console.error(error);
      if (res.headersSent) return res.end();
      json(res, error.status ?? 500, { error: error.status ? error.message : "SafeStride couldn't complete the request." });
    }
  }

  return { handle, close: () => db.close() };
}

if (require.main === module) {
  const host = process.env.SAFESTRIDE_HOST ?? "127.0.0.1";
  const port = Number(process.env.SAFESTRIDE_PORT ?? 8765);
  const app = createApp({
    database: join(__dirname, ".safestride", "safestride.sqlite"),
    secureCookie: process.env.SAFESTRIDE_SECURE_COOKIE === "1"
  });
  const server = createServer(app.handle);
  server.listen(port, host, () => console.log(`SafeStride listening on http://${host}:${server.address().port}`));
}

module.exports = { createApp };
