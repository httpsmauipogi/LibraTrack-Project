import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../index.js';

async function fetchPath(pathname) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  const body = await response.text();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return { status: response.status, body };
}

test('home route responds successfully', async () => {
  const result = await fetchPath('/');
  assert.equal(result.status, 200);
  assert.match(result.body, /LibraTrack/i);
});

test('member dashboard route responds successfully', async () => {
  const result = await fetchPath('/dashboard');
  assert.equal(result.status, 200);
  assert.match(result.body, /Member Portal|LibraTrack/i);
  assert.match(result.body, /href="\/logout"/);
  assert.match(result.body, /fa-right-from-bracket/);
});

test('public book API proxies the catalog admin book list', async () => {
  const result = await fetchPath('/api/books');
  assert.equal(result.status, 200);
  const books = JSON.parse(result.body);
  assert.ok(Array.isArray(books));
  assert.ok(books.every((book) => book.id && book.title));
});

test('member holds and loans start empty', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const loginResponse = await fetch(`http://127.0.0.1:${port}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'email=member.one%40libra.local&password=password123',
    redirect: 'manual'
  });

  const cookies = loginResponse.headers.get('set-cookie');
  assert.equal(loginResponse.status, 302);
  assert.match(cookies || '', /connect.sid/i);

  const holds = await fetch(`http://127.0.0.1:${port}/api/member/holds`, {
    headers: cookies ? { Cookie: cookies } : undefined,
    redirect: 'manual'
  });

  const loans = await fetch(`http://127.0.0.1:${port}/api/member/loans`, {
    headers: cookies ? { Cookie: cookies } : undefined,
    redirect: 'manual'
  });

  const holdsBody = await holds.text();
  const loansBody = await loans.text();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  assert.equal(holds.status, 200);
  assert.equal(loans.status, 200);
  assert.deepEqual(JSON.parse(holdsBody), []);
  assert.deepEqual(JSON.parse(loansBody), []);
});

test('dashboard shows the signed-in user name from session', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const loginResponse = await fetch(`http://127.0.0.1:${port}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'email=member.one%40libra.local&password=password123',
    redirect: 'manual'
  });

  const cookies = loginResponse.headers.get('set-cookie');
  assert.equal(loginResponse.status, 302);
  assert.match(cookies || '', /connect.sid/i);

  const dashboardResponse = await fetch(`http://127.0.0.1:${port}/dashboard`, {
    headers: cookies ? { Cookie: cookies } : undefined,
    redirect: 'manual'
  });

  const body = await dashboardResponse.text();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  assert.match(body, /Library Member One/i);
  assert.doesNotMatch(body, /Maria Clara/i);
});
