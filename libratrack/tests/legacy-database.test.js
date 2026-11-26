import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, (error) => (error ? reject(error) : resolve()));
});

const all = (db, sql) => new Promise((resolve, reject) => {
  db.all(sql, (error, rows) => (error ? reject(error) : resolve(rows)));
});

const close = (db) => new Promise((resolve) => db.close(resolve));

test('migrates a pre-memberId database without losing users', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'libratrack-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const storage = path.join(directory, 'legacy.db');

  const legacy = new sqlite3.Database(storage);
  try {
    await run(legacy, `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role TEXT NOT NULL DEFAULT 'visitors',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
    `);
    await run(legacy,
      "INSERT INTO users (name, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
      ['Legacy User', 'legacy@libra.local', 'hashed-password', 'member']
    );
  } finally {
    await close(legacy);
  }

  execFileSync(process.execPath, ['migrate.js'], {
    cwd: appRoot,
    env: { ...process.env, DB_STORAGE: storage },
    stdio: 'pipe'
  });

  const migrated = new sqlite3.Database(storage);
  try {
    const columns = await all(migrated, 'PRAGMA table_info(`users`)');
    assert.ok(columns.some((column) => column.name === 'member_id'));

    const users = await all(migrated, 'SELECT name, email, password FROM users');
    assert.deepEqual(users, [
      { name: 'Legacy User', email: 'legacy@libra.local', password: 'hashed-password' }
    ]);
  } finally {
    await close(migrated);
  }
});
