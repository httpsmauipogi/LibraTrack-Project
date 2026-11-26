import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Set the storage path before importing the app so db.js uses this temp file.
const directory = mkdtempSync(path.join(tmpdir(), 'libratrack-catalog-'));
process.env.DB_STORAGE = path.join(directory, 'catalog.db');

const { startServer } = await import('../index.js');
const { connectDatabase, sequelize } = await import('../models/db.js');
const { Book } = await import('../models/bookModel.js');

const post = (base, route, body) => fetch(`${base}${route}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body).toString(),
  redirect: 'manual'
});

test('catalog book management works without a login', async (t) => {
  await connectDatabase();

  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const newBook = {
    title: 'Clean Code',
    author: 'Robert C. Martin',
    isbn: '978-0132350884',
    category: 'Computer Science',
    shelf: 'CS-101-A',
    quantity: '3'
  };

  const created = await post(base, '/api/books', newBook);
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.title, 'Clean Code');
  assert.equal(createdBody.totalCopies, 3);
  assert.ok(await Book.findOne({ where: { isbn: newBook.isbn } }));

  const dashboard = await fetch(`${base}/dashboard`, { redirect: 'manual' });
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert.match(html, /Catalog Administration/);
  assert.doesNotMatch(html, /Sign out/);
  assert.doesNotMatch(html, /Sign in/);
  assert.doesNotMatch(html, /Review Requests/);
  assert.match(html, /href="\/books"[^>]*>Catalog<\/a>/);

  // The Catalog button now opens a real catalog site, not the landing page.
  const catalogSite = await fetch(`${base}/books`, { redirect: 'manual' });
  assert.equal(catalogSite.status, 200);
  assert.match(await catalogSite.text(), /Clean Code/);
});
