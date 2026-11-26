import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';

const directory = mkdtempSync(path.join(tmpdir(), 'libratrack-catalog-shared-'));
process.env.DB_STORAGE = path.join(directory, 'catalog.db');

const { startServer } = await import('../index.js');
const { connectDatabase, sequelize } = await import('../models/db.js');
const { User, Book, Borrowing } = await import('../models/index.js');

test('Borrow Logs show records from the shared borrowings table', async (t) => {
  await connectDatabase();
  const admin = await User.create({
    name: 'Shared Admin',
    email: 'shared-admin@catalog.test',
    password: await bcrypt.hash('unused-password', 10),
    role: 'admin'
  });
  const book = await Book.create({
    title: 'Shared Source Book',
    author: 'LibraTrack',
    isbn: '978-0-000000-00-2',
    category: 'Test',
    shelf: 'TEST-2',
    totalCopies: 2,
    availableCopies: 1
  });
  await Borrowing.create({
    userId: admin.id,
    bookId: book.id,
    borrowDate: '2026-11-20',
    dueDate: '2026-11-27',
    status: 'active',
    notes: 'Created by the borrow portal.'
  });
  const pending = await Borrowing.create({
    userId: admin.id,
    bookId: book.id,
    status: 'pending',
    notes: 'Awaiting admin review.'
  });

  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const response = await fetch(`${base}/api/loans`, { redirect: 'manual' });
  assert.equal(response.status, 200);
  const loans = await response.json();
  const activeLoan = loans.find((loan) => loan.id && loan.status === 'active');
  assert.ok(activeLoan);
  assert.equal(activeLoan.Book?.title, 'Shared Source Book');
  assert.equal(activeLoan.statusLabel, 'ACTIVE');
  assert.equal(activeLoan.isActiveLoan, true);

  const pendingRecord = loans.find((loan) => loan.id === pending.id);
  assert.equal(pendingRecord.status, 'pending');
  assert.equal(pendingRecord.statusLabel, 'PENDING');
  assert.equal(pendingRecord.isActiveLoan, false);

  // Pending requests are still visible in the log, but are not counted as loans.
  assert.equal(loans.filter((loan) => loan.isActiveLoan).length, 1);

  // Borrow history must survive even after a book is returned.
  const deleteAttempt = await fetch(`${base}/api/books/${book.id}`, {
    method: 'DELETE',
    redirect: 'manual'
  });
  assert.equal(deleteAttempt.status, 409);
  assert.match((await deleteAttempt.json()).error, /borrowing history/);
});
