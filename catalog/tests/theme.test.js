import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'libratrack-theme-'));
process.env.DB_STORAGE = path.join(directory, 'catalog.db');

const { startServer } = await import('../index.js');
const { connectDatabase, sequelize } = await import('../models/db.js');

test('all portals render the shared LibraTrack theme', async (t) => {
  await connectDatabase();
  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const home = await fetch(base);
  assert.equal(home.status, 200);
  const html = await home.text();

  // Canonical head: Inter font, deep-indigo palette, shared component classes.
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Inter/);
  assert.match(html, /#1e1b4b/);
  assert.match(html, /lt-card/);
  // Canonical navbar replaces each app's bespoke header.
  assert.match(html, /bg-libra-deep/);
  assert.match(html, /Integrated Library System/);

  // Responsive foundation: phone-safe viewport, touch targets, scrollable
  // tables, short-screen modals, and a collapsible mobile navigation menu.
  assert.match(html, /width=device-width, initial-scale=1\.0, viewport-fit=cover/);
  assert.match(html, /min-h-\[44px\]/);
  assert.match(html, /lt-table-wrap/);
  assert.match(html, /100dvh/);

  // The collapsible menu lives in the shared navbar used by inner pages.
  const catalogPage = await fetch(`${base}/books`);
  assert.equal(catalogPage.status, 200);
  const catalogHtml = await catalogPage.text();
  assert.match(catalogHtml, /id="lt-menu-toggle"/);
  assert.match(catalogHtml, /id="lt-mobile-menu"/);
  assert.match(catalogHtml, /aria-controls="lt-mobile-menu"/);
  // No stale duplicate head or bespoke footer.
  assert.equal((html.match(/<head>/g) || []).length, 1);
  assert.doesNotMatch(html, /XianFire Framework/);
});
