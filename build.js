"use strict";

const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { staticFiles } = require("./server");

const output = join(__dirname, "public");
mkdirSync(output, { recursive: true });
for (const file of staticFiles) copyFileSync(join(__dirname, file), join(output, file));
