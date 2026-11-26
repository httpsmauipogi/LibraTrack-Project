import test from 'node:test';
import assert from 'node:assert/strict';

import { getDatabaseConfig } from '../models/db.js';

test('defaults to a local SQLite database', () => {
  const config = getDatabaseConfig({});
  assert.equal(config.dialect, 'sqlite');
  assert.match(config.storage, /shared\.db$/);
});

test('honors an explicit SQLite storage path', () => {
  const config = getDatabaseConfig({ DB_STORAGE: ':memory:' });
  assert.equal(config.dialect, 'sqlite');
  assert.equal(config.storage, ':memory:');
});
