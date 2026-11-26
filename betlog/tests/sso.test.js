import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';

process.env.SSO_SECRET = 'test-sso-secret-for-betlog-suite';

const directory = mkdtempSync(path.join(tmpdir(), 'libratrack-betlog-no-auth-'));
process.env.DB_STORAGE = path.join(directory, 'betlog.db');

const { startServer } = await import('../index.js');
const { connectDatabase, sequelize } = await import('../models/db.js');
const { User } = await import('../models/userModel.js');
const { createSsoToken } = await import('../../shared/sso.js');

test('legacy SSO links simply redirect to the public Borrowed Books page', async (t) => {
  await connectDatabase();
  await User.create({
    name: 'Admin User',
    email: 'sso-admin@betlog.test',
    password: await bcrypt.hash('unused-password', 10),
    role: 'admin'
  });

  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const token = createSsoToken('sso-admin@betlog.test', '/admin/borrowings');
  const response = await fetch(`${base}/sso/login?token=${encodeURIComponent(token)}`, {
    redirect: 'manual'
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/borrowings');

  // No login is needed even without carrying any cookie from the redirect.
  const adminPage = await fetch(`${base}/admin/borrowings`, { redirect: 'manual' });
  assert.equal(adminPage.status, 200);

  const staleToken = await fetch(`${base}/sso/login?token=invalid.token`, { redirect: 'manual' });
  assert.equal(staleToken.status, 302);
  assert.equal(staleToken.headers.get('location'), '/admin/borrowings');
});
