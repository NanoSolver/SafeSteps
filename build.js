"use strict";

const { copyFileSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { staticFiles } = require("./server");

const output = join(__dirname, "public");
mkdirSync(output, { recursive: true });
for (const file of staticFiles) copyFileSync(join(__dirname, file), join(output, file));

const analyticsPackage = dirname(require.resolve("@vercel/analytics/package.json"));
copyFileSync(join(analyticsPackage, "dist", "index.mjs"), join(output, "vercel-analytics.js"));
copyFileSync(join(__dirname, "analytics.js"), join(output, "analytics.js"));

const index = join(output, "index.html");
const html = readFileSync(index, "utf8");
writeFileSync(index, html.replace("</head>", '  <script type="module" src="/analytics.js"></script>\n</head>'));
