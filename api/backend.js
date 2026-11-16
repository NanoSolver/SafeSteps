"use strict";

const { createApp } = require("../server");
const { hosted, unavailable } = require("../storage");

function createHandler(store) {
  const app = createApp({ store, secureCookie: true });
  return (req, res) => {
    const requested = new URL(req.url, "http://localhost");
    if (requested.pathname === "/api/backend") {
      const path = requested.searchParams.get("vercelPath");
      req.url = path && /^[a-z0-9]+(?:\/[a-z0-9]+)*$/.test(path) ? "/api/" + path : "/api/backend";
    }
    return app.handle(req, res);
  };
}

function connectStorage() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return unavailable();
  try {
    const { createClient } = require("@libsql/client/web");
    return hosted(createClient({ url, authToken }));
  } catch (error) {
    console.error("Could not initialize hosted storage.", error.code ?? error.name);
    return unavailable();
  }
}

let handle;
module.exports = (req, res) => {
  handle ??= createHandler(connectStorage());
  return handle(req, res);
};
module.exports.createHandler = createHandler;
