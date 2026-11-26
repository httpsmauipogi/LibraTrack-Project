import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';

// Set the storage path before any app module is imported so db.js picks it up.
const directory = mkdtempSync(path.join(tmpdir(), 'libratrack-betlog-'));
process.env.DB_STORAGE = path.join(directory, 'betlog.db');
// Even with member auth enabled, Borrowed Books must stay public.
process.env.AUTH_REQUIRED = 'true';

const { startServer } = await import('../index.js');
const { connectDatabase, sequelize } = await import('../models/db.js');
const { User } = await import('../models/userModel.js');
const { Book } = await import('../models/Book.js');
const { Borrowing } = await import('../models/Borrowing.js');

const post = (base, route, body, cookie) => fetch(`${base}${route}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(cookie ? { Cookie: cookie } : {})
  },
  body: new URLSearchParams(body).toString(),
  redirect: 'manual'
});

test('borrowed books ledger is permanently public', async (t) => {
  await connectDatabase();
  await User.create({
    name: 'Admin User',
    email: 'admin@betlog.test',
    password: await bcrypt.hash('admin-pass-123', 10),
    role: 'admin'
  });
  const book = await Book.create({
    title: 'Clean Code',
    author: 'Robert C. Martin',
    isbn: '978-0132350884',
    category: 'Computer Science',
    shelf: 'CS-101-A',
    totalCopies: 2,
    availableCopies: 2,
    status: 'available'
  });

  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const home = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /href="http:\/\/localhost:3001\/books"[^>]*>Catalog<\/a>/);

  const guest = await fetch(`${base}/admin/borrowings`, { redirect: 'manual' });
  assert.equal(guest.status, 200);
  const guestBody = await guest.text();
  assert.match(guestBody, /Borrowing Records/);
  assert.doesNotMatch(guestBody, /Sign in/);
  assert.doesNotMatch(guestBody, /Sign out/);

  const sso = await fetch(`${base}/sso/login?token=invalid&next=/admin/borrowings`, {
    redirect: 'manual'
  });
  assert.equal(sso.status, 302);
  assert.equal(sso.headers.get('location'), '/admin/borrowings');

  const registered = await post(base, '/register', {
    name: 'Regular Member',
    email: 'member@betlog.test',
    password: 'member-pass-123'
  });
  const memberCookie = registered.headers.get('set-cookie');
  assert.equal(registered.status, 302);

  const borrowed = await post(base, `/books/${book.id}/borrow`, {}, memberCookie);
  assert.equal(borrowed.status, 302);
  assert.equal(borrowed.headers.get('location'), '/borrowings');

  const member = await User.findOne({ where: { email: 'member@betlog.test' } });
  await Borrowing.create({
    userId: member.id,
    bookId: book.id,
    status: 'cancelled',
    notes: 'Cancelled by member.'
  });

  const memberAdminAttempt = await fetch(`${base}/admin/borrowings`, {
    headers: { Cookie: memberCookie },
    redirect: 'manual'
  });
  assert.equal(memberAdminAttempt.status, 200);

  const adminLogin = await post(base, '/login', {
    email: 'admin@betlog.test',
    password: 'admin-pass-123'
  });
  const adminCookie = adminLogin.headers.get('set-cookie');
  assert.equal(adminLogin.status, 302);
  assert.equal(adminLogin.headers.get('location'), '/dashboard');

  const dashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: adminCookie },
    redirect: 'manual'
  });
  assert.equal(dashboard.status, 200);
  assert.doesNotMatch(await dashboard.text(), /Review Requests/);

  const manage = await fetch(`${base}/admin/borrowings`, {
    headers: { Cookie: adminCookie },
    redirect: 'manual'
  });
  assert.equal(manage.status, 200);
  const manageBody = await manage.text();
  assert.match(manageBody, /Borrowing Records/);
  assert.match(manageBody, /Requests &amp; closed records/);
  // Pending requests are visible here but reviewed on the central console.
  assert.match(manageBody, /Clean Code/);
  assert.match(manageBody, /Review in Admin Console/);
  assert.match(manageBody, /CANCELLED/);
  assert.doesNotMatch(manageBody, />Accept<\/button>/);

  const added = await post(base, '/admin/books', {
    title: 'The Pragmatic Programmer',
    author: 'Andrew Hunt',
    genre: 'Computer Science',
    copies: 3
  }, adminCookie);
  assert.equal(added.status, 302);
  assert.equal(added.headers.get('location'), '/admin/books');
  assert.ok(await Book.findOne({ where: { title: 'The Pragmatic Programmer' } }));

  const request = await Borrowing.findOne({ where: { status: 'pending' } });
  assert.ok(request);
  // Approval, rejection, and returns work with no session at all.
  const approved = await post(base, `/admin/borrowings/${request.id}/approve`, {});
  assert.equal(approved.status, 302);
  assert.equal(approved.headers.get('location'), '/admin/borrowings');

  await request.reload();
  assert.equal(request.status, 'active');
  await book.reload();
  assert.equal(book.available, 1);

  const rejectedRecord = await Borrowing.create({
    userId: member.id,
    bookId: book.id,
    status: 'pending',
    notes: 'Second request.'
  });
  const rejected = await post(base, `/admin/borrowings/${rejectedRecord.id}/reject`, {});
  assert.equal(rejected.status, 302);
  await rejectedRecord.reload();
  assert.equal(rejectedRecord.status, 'rejected');

  const returned = await post(base, `/admin/borrowings/${request.id}/return`, {});
  assert.equal(returned.status, 302);
  await request.reload();
  assert.equal(request.status, 'returned');

  const borrowedList = await fetch(`${base}/admin/borrowings`, { redirect: 'manual' });
  assert.equal(borrowedList.status, 200);
  const borrowedBody = await borrowedList.text();
  assert.match(borrowedBody, /Clean Code/);
  assert.match(borrowedBody, /REJECTED/);
  assert.doesNotMatch(borrowedBody, /Sign in/);
  assert.doesNotMatch(borrowedBody, /Sign out/);
});
