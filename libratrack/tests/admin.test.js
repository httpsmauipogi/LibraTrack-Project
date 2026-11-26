import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';

const directory = mkdtempSync(path.join(tmpdir(), 'libratrack-admin-'));
process.env.DB_STORAGE = path.join(directory, 'admin.db');

const { startServer } = await import('../index.js');
const { connectDatabase, sequelize } = await import('../models/db.js');
const { User } = await import('../models/userModel.js');
const { Book, Borrowing } = await import('../models/index.js');

const post = (base, route, body, cookie) => fetch(`${base}${route}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(cookie ? { Cookie: cookie } : {})
  },
  body: new URLSearchParams(body).toString(),
  redirect: 'manual'
});

test('the borrow review console is permanently public', async (t) => {
  await connectDatabase();
  await User.create({
    memberId: 'ADM-1',
    name: 'Site Admin',
    email: 'admin@libra.local',
    password: await bcrypt.hash('admin-pass-123', 10),
    role: 'admin'
  });

  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const guest = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(guest.status, 200);
  const guestBody = await guest.text();
  assert.match(guestBody, /Administrator Console/);
  assert.match(guestBody, /Borrow Review/);
  assert.doesNotMatch(guestBody, /Borrow requests awaiting review/);
  assert.doesNotMatch(guestBody, /Sign in/);
  assert.doesNotMatch(guestBody, /Sign out/);

  const registered = await post(base, '/register', {
    firstName: 'Regular',
    lastName: 'Member',
    email: 'member@libra.local',
    password: 'member-pass-123',
    confirmPassword: 'member-pass-123'
  });
  const memberCookie = registered.headers.get('set-cookie');
  assert.equal(registered.status, 302);

  const memberAttempt = await fetch(`${base}/admin`, {
    headers: { Cookie: memberCookie },
    redirect: 'manual'
  });
  assert.equal(memberAttempt.status, 200);

  const adminLogin = await post(base, '/login', {
    email: 'admin@libra.local',
    password: 'admin-pass-123'
  });
  const adminCookie = adminLogin.headers.get('set-cookie');
  assert.equal(adminLogin.status, 302);
  assert.equal(adminLogin.headers.get('location'), '/dashboard');

  const adminConsole = await fetch(`${base}/admin`, {
    headers: { Cookie: adminCookie },
    redirect: 'manual'
  });
  assert.equal(adminConsole.status, 200);
  const body = await adminConsole.text();
  assert.match(body, /Administrator Console/);
  assert.match(body, /admin@libra\.local/);
  assert.match(body, /Connected portals/);
  assert.match(body, /href="http:\/\/localhost:3001\/dashboard"/);
  assert.match(body, /href="\/admin\/requests"/);
  assert.match(body, /href="http:\/\/localhost:3002\/admin\/borrowings"/);
  assert.doesNotMatch(body, /\/sso\/login\?token=/);
  assert.doesNotMatch(body, /\$2[aby]\$/);

  // All three admin buttons are public redirects; no SSO token or session is needed.
  const portal = await fetch(`${base}/admin/portal/catalog`, { redirect: 'manual' });
  assert.equal(portal.status, 302);
  assert.equal(portal.headers.get('location'), 'http://localhost:3001/dashboard');

  const borrowPortal = await fetch(`${base}/admin/portal/betlog`, { redirect: 'manual' });
  assert.equal(borrowPortal.status, 302);
  assert.equal(borrowPortal.headers.get('location'), 'http://localhost:3002/admin/borrowings');

  const reviewPortal = await fetch(`${base}/admin/portal/requests`, { redirect: 'manual' });
  assert.equal(reviewPortal.status, 302);
  assert.equal(reviewPortal.headers.get('location'), '/admin/requests');

  // A member request from the dashboard is reviewed on this admin console.
  const book = await Book.create({
    title: 'Dashboard Request Book',
    author: 'Test Author',
    isbn: '978-9999999999',
    category: 'Testing',
    shelf: 'TST-001',
    totalCopies: 2,
    availableCopies: 2,
    status: 'available'
  });

  const submitted = await post(base, '/api/member/requests', {
    bookId: book.id,
    note: 'Needed for class'
  }, memberCookie);
  assert.equal(submitted.status, 201);
  const submittedBody = await submitted.json();
  assert.equal(submittedBody.rawStatus, 'pending');

  const consoleWithRequest = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(consoleWithRequest.status, 200);
  const consoleHtml = await consoleWithRequest.text();
  assert.doesNotMatch(consoleHtml, /Borrow requests awaiting review/);
  assert.doesNotMatch(consoleHtml, /Dashboard Request Book/);
  assert.doesNotMatch(consoleHtml, new RegExp(`/admin/requests/${submittedBody.id}/approve`));
  assert.match(consoleHtml, /Borrow Review/);
  assert.doesNotMatch(consoleHtml, /Sign in/);
  assert.doesNotMatch(consoleHtml, /Sign out/);

  const requestsPage = await fetch(`${base}/admin/requests`, { redirect: 'manual' });
  assert.equal(requestsPage.status, 200);
  const requestsHtml = await requestsPage.text();
  assert.match(requestsHtml, /Borrow Requests/);
  assert.match(requestsHtml, /Dashboard Request Book/);
  assert.match(requestsHtml, /member@libra\.local/);
  assert.match(requestsHtml, /Needed for class/);
  assert.match(requestsHtml, new RegExp(`/admin/requests/${submittedBody.id}/approve`));
  assert.doesNotMatch(requestsHtml, /Sign in/);
  assert.doesNotMatch(requestsHtml, /Sign out/);

  // Approval works without any session cookie.
  const approvedRequest = await post(base, `/admin/requests/${submittedBody.id}/approve`, {});
  assert.equal(approvedRequest.status, 302);
  assert.equal(approvedRequest.headers.get('location'), '/admin/requests');

  const borrowing = await Borrowing.findByPk(submittedBody.id);
  assert.equal(borrowing.status, 'active');
  await book.reload();
  assert.equal(book.availableCopies, 1);

  const reviewedAgain = await fetch(`${base}/admin/requests`, { redirect: 'manual' });
  assert.doesNotMatch(await reviewedAgain.text(), /Dashboard Request Book/);
});
