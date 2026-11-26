import test from 'node:test';
import assert from 'node:assert/strict';

import { getDatabaseConfig } from '../models/db.js';

test('defaults to a persistent SQLite database', () => {
  const config = getDatabaseConfig({});
  assert.equal(config.dialect, 'sqlite');
  assert.match(config.storage, /shared\.db$/);
});

test('honors a custom SQLite storage path', () => {
  const config = getDatabaseConfig({ DB_STORAGE: ':memory:' });
  assert.equal(config.dialect, 'sqlite');
  assert.equal(config.storage, ':memory:');
});

test('supports an explicitly configured MySQL database', () => {
  const config = getDatabaseConfig({
    DB_DIALECT: 'mysql',
    DB_HOST: 'db.local',
    DB_PORT: '3307',
    DB_USER: 'libratrack',
    DB_PASSWORD: 'secret',
    DB_NAME: 'Library'
  });

  assert.equal(config.dialect, 'mysql');
  assert.equal(config.host, 'db.local');
  assert.equal(config.port, 3307);
  assert.equal(config.username, 'libratrack');
  assert.equal(config.password, 'secret');
  assert.equal(config.database, 'Library');
});
