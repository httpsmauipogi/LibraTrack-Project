import test from "node:test";
import assert from "node:assert/strict";

import { getDatabaseConfig } from "../models/db.js";
import { resolvePort } from "../index.js";

test("defaults to a SQLite database when no MySQL environment is configured", () => {
  const config = getDatabaseConfig();
  assert.equal(config.dialect, "sqlite");
  assert.ok(config.storage.includes("libraTrack"));
});

test("resolves the next available port when the preferred one is busy", () => {
  const nextPort = resolvePort(3000, new Set([3000, 3001]));
  assert.equal(nextPort, 3002);
});
