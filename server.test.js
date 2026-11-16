"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtempSync, unlinkSync, rmdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { Readable } = require("node:stream");
const { createApp } = require("./server");
const { createMapServices } = require("./map-services");

function client(app, session = "") {
  return async (url, { method = "GET", data, token, origin } = {}) => {
    const request = Object.assign(Readable.from(data === undefined ? [] : [Buffer.from(JSON.stringify(data))]), {
      url, method, socket: { remoteAddress: "127.0.0.1" },
      headers: {
        host: "localhost", origin, cookie: session,
        authorization: token ? "Bearer " + token : undefined,
        "content-type": data === undefined ? undefined : "application/json"
      }
    });
    const headers = {};
    let status;
    let body;
    const response = {
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      writeHead(code, extra) {
        status = code;
        Object.assign(headers, Object.fromEntries(Object.entries(extra).map(([key, value]) => [key.toLowerCase(), value])));
      },
      end(value) { body = value?.toString(); }
    };
    await app.handle(request, response);
    if (headers["set-cookie"]) session = headers["set-cookie"].split(";")[0];
    return { status, headers, body: headers["content-type"].startsWith("application/json") ? JSON.parse(body) : body };
  };
}

const post = data => ({ method: "POST", data });
const credentials = { username: "walker", displayName: "Test Walker", password: "demo-password-only" };

test("private check-ins progress, survive restart, and can be revoked by the owner", async () => {
  const dir = mkdtempSync(join(tmpdir(), "safestride-test-"));
  const database = join(dir, "test.sqlite");
  let time = Date.UTC(2026, 0, 1);
  const options = { database, now: () => time, secureCookie: true };
  let app = createApp(options);
  try {
    const walker = client(app);
    const contact = client(app);
    assert.equal((await contact("/api/walk", post({ minutes: 1 }))).status, 401);
    const registered = await walker("/api/register", post(credentials));
    assert.equal(registered.status, 201);
    assert.match(registered.headers["set-cookie"], /HttpOnly; SameSite=Strict; Secure/);
    assert.equal((await walker("/api/walk", post({ minutes: 0 }))).status, 400);
    const started = await walker("/api/walk", post({ minutes: 1, address: "ignored" }));
    assert.equal(started.status, 201);
    const { id, token, dueAt } = started.body.walk;
    assert.equal((await walker("/api/walk", post({ minutes: 2 }))).status, 409);
    assert.equal((await contact("/api/contact")).status, 404);
    assert.deepEqual((await contact("/api/contact", { token })).body, {
      status: "walking", displayName: "Test Walker", dueAt, arrivedAt: null
    });
    assert.equal((await contact("/api/register", post({ ...credentials, username: "other" }))).status, 201);
    assert.equal((await contact(`/api/walk/${id}/arrive`, post())).status, 404);
    assert.equal((await contact(`/api/walk/${id}/close`, post())).status, 404);
    time = dueAt + 1000;
    assert.equal((await contact("/api/contact", { token })).body.status, "overdue");
    app.close();
    app = createApp(options);
    const previousSession = registered.headers["set-cookie"].split(";")[0];
    const returningWalker = client(app, previousSession);
    assert.equal((await returningWalker("/api/walk")).body.walk.status, "overdue");
    const arrived = await returningWalker(`/api/walk/${id}/arrive`, post());
    assert.equal(arrived.body.walk.status, "arrived");
    time += 1000;
    const retried = await returningWalker(`/api/walk/${id}/arrive`, post());
    assert.equal(retried.body.walk.arrivedAt, arrived.body.walk.arrivedAt);
    assert.equal((await client(app)("/api/contact", { token })).body.status, "arrived");
    assert.equal((await returningWalker(`/api/walk/${id}/close`, post())).status, 200);
    assert.equal((await client(app)("/api/contact", { token })).status, 404);
    assert.equal((await returningWalker(`/api/walk/${id}/arrive`, post())).status, 409);
    const next = (await returningWalker("/api/walk", post({ minutes: 1 }))).body.walk;
    time = next.expiresAt;
    assert.equal((await client(app)("/api/contact", { token: next.token })).status, 404);
    assert.equal((await returningWalker("/api/walk", post({ minutes: 1 }))).status, 201);
  } finally {
    app.close();
    unlinkSync(database);
    rmdirSync(dir);
  }
});

test("accounts and shared community records work across independent sessions", async () => {
  const app = createApp();
  try {
    const first = client(app);
    const second = client(app);
    const guest = client(app);
    assert.equal((await guest("/")).status, 200);
    assert.equal((await guest("/check-in.js")).status, 200);
    assert.equal((await guest("/server.js")).status, 404);
    assert.equal((await first("/api/register", post(credentials))).status, 201);
    assert.equal((await second("/api/register", post(credentials))).status, 409);
    assert.equal((await second("/api/login", post({ ...credentials, password: "incorrect-password" }))).status, 401);
    assert.equal((await second("/api/register", post({ ...credentials, username: "second" }))).status, 201);
    const report = { type: "Broken streetlight", place: "museum" };
    assert.equal((await first("/api/reports", { ...post(report), origin: "https://elsewhere.test" })).status, 403);
    assert.equal((await guest("/api/reports", post(report))).status, 401);
    assert.equal((await first("/api/reports", post({ ...report, place: "invalid" }))).status, 400);
    assert.equal((await first("/api/reports", post(report))).status, 201);
    const legacyReport = (await second("/api/community")).body.reports[0];
    const { id } = legacyReport;
    assert.equal(legacyReport.landmark, "Government Museum");
    assert(Number.isFinite(legacyReport.lat));
    assert.equal((await first(`/api/reports/${id}/confirm`, post())).status, 409);
    assert.equal((await second(`/api/reports/${id}/confirm`, post())).status, 200);
    assert.equal((await second(`/api/reports/${id}/confirm`, post())).status, 200);
    assert.equal((await first("/api/havens", post({ name: "Help Desk", type: "Security desk", lat: 13.01, lon: 77.52 }))).status, 201);
    const { reports, havens } = (await guest("/api/community")).body;
    assert.equal(reports[0].confirmations, 1);
    assert.equal(havens[0].name, "Help Desk");
    assert.equal(havens[0].lat, 13.01);
    assert.equal(havens[0].lon, 77.52);
    assert.equal((await first("/api/logout", post())).status, 200);
    assert.equal((await first("/api/session")).body.account, null);
    assert.equal((await first("/api/login", post(credentials))).status, 200);
  } finally {
    app.close();
  }
});

test("street map searches and routes accept geographic points beyond demo landmarks", async () => {
  const seen = [];
  const maps = createMapServices({
    geocoder: "https://maps.example.test/api/",
    router: "https://routes.example.test/routed-foot/route/v1/driving/",
    fetcher: async (url, { headers }) => {
      assert.match(headers["User-Agent"], /SafeStride/);
      seen.push(url);
      if (url.hostname === "maps.example.test") return {
        ok: true, json: async () => ({
          features: [{ geometry: { coordinates: [-0.14, 51.5] }, properties: { name: "Station", city: "London" } }]
        })
      };
      const geometry = { type: "LineString", coordinates: [[-0.14, 51.5], [-0.13, 51.51]] };
      return { ok: true, json: async () => ({ routes: [
        { duration: 780, distance: 1100, geometry },
        { duration: 600, distance: 900, geometry }
      ] }) };
    }
  });
  const app = createApp({ maps });
  try {
    const guest = client(app);
    const search = await guest("/api/map/search", post({ query: "London Station" }));
    const from = { lat: 51.5, lon: -0.14 };
    const to = { lat: 51.51, lon: -0.13 };
    assert.deepEqual(search.body.results, [{ ...from, label: "Station", detail: "London" }]);
    assert.equal(seen[0].searchParams.get("q"), "London Station");
    assert.equal((await guest("/api/map/walk", post({ from, to: { lat: 99, lon: 0 } }))).status, 400);
    const route = await guest("/api/map/walk", post({ from, to }));
    assert.equal(route.status, 200);
    assert.deepEqual(route.body.routes[0], { metres: 900, minutes: 10, shape: [[51.5, -0.14], [51.51, -0.13]] });
    assert.match(seen[1].pathname, /routed-foot.*-0\.140000,51\.500000;-0\.130000,51\.510000/);
    assert.equal((await guest("/api/map/walk", post({ from, to }))).status, 429);
  } finally {
    app.close();
  }
});
