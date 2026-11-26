import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'libratrack-catalog-no-auth-'));
process.env.DB_STORAGE = path.join(directory, 'catalog.db');

const { startServer } = await import('../index.js');
const { connectDatabase, sequelize } = await import('../models/db.js');

test('catalog login, SSO, and logout routes are permanently removed', async (t) => {
  await connectDatabase();

  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    rmSync(directory, { recursive: true, force: true });
  });

  for (const route of ['/login', '/sso/login?token=anything', '/logout']) {
    const response = await fetch(`${base}${route}`, { redirect: 'manual' });
    assert.equal(response.status, 404, `${route} should not exist`);
  }
  const postLogin = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual' });
  assert.equal(postLogin.status, 404);

  const dashboard = await fetch(`${base}/dashboard`, { redirect: 'manual' });
  assert.equal(dashboard.status, 200);
  const body = await dashboard.text();
  assert.match(body, /Catalog Administration/);
  assert.match(body, /Admin User/);
  assert.doesNotMatch(body, /Sign in/);
  assert.doesNotMatch(body, /Sign out/);
  assert.doesNotMatch(body, /action="\/login"/);
});
