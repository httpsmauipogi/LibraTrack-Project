import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeBorrowingStatus } from "../shared/borrowing-status.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const target = path.join(root, "data", "shared.db");

fs.mkdirSync(path.dirname(target), { recursive: true });

const db = new DatabaseSync(target);
db.exec(`
  PRAGMA foreign_keys = OFF;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    library_card VARCHAR(255),
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
  );
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(255) NOT NULL,
    shelf VARCHAR(255) NOT NULL,
    total_copies INTEGER NOT NULL DEFAULT 1,
    available_copies INTEGER NOT NULL DEFAULT 1,
    borrow_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'available',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
  );
  CREATE TABLE IF NOT EXISTS borrowings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    borrow_date DATE,
    due_date DATE,
    return_date DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
  );
`);

const quote = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;
const now = new Date().toISOString();
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10) || null;
  return parsed.toISOString().slice(0, 10);
};
const columnsFor = (conn, table) =>
  conn.prepare(`PRAGMA table_info(${quote(table)})`).all().map((column) => column.name);
const hasTable = (conn, table) => columnsFor(conn, table).length > 0;
const valueOf = (row, ...names) => {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
  }
  return null;
};
const exists = (table, column, value) =>
  Boolean(db.prepare(`SELECT 1 FROM ${quote(table)} WHERE ${quote(column)} = ? LIMIT 1`).get(value));

const openSource = (relativePath) => {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return null;
  return { file, db: new DatabaseSync(file) };
};

const readRows = (source, table) => {
  if (!source || !hasTable(source.db, table)) return [];
  return source.db.prepare(`SELECT * FROM ${quote(table)}`).all();
};

const rolePriority = { visitors: 0, member: 1, staff: 2, admin: 3 };
const pickRole = (...values) => {
  const roles = values.filter(Boolean).map((role) => String(role));
  return roles.sort((a, b) => (rolePriority[b] ?? 0) - (rolePriority[a] ?? 0))[0] || "member";
};

// Users: merge the three old databases by email. The admin account wins.
for (const sourcePath of [
  "libratrack/data/libratrack.db",
  "catalog/data/libraTrack.db",
  "betlog/data/betlog.db"
]) {
  const source = openSource(sourcePath);
  if (!source) continue;

  for (const row of [
    ...readRows(source, "users"),
    ...readRows(source, "Users").filter((user) => !hasTable(source.db, "users"))
  ]) {
    const email = normalizeEmail(valueOf(row, "email"));
    if (!email) continue;

    const memberId = valueOf(row, "member_id", "memberId")
      || (pickRole(row.role) === "admin" ? "ADM-2026-001" : `MEM-${row.id}`);
    const createdAt = valueOf(row, "created_at", "createdAt") || now;
    const updatedAt = valueOf(row, "updated_at", "updatedAt") || now;
    const existing = db.prepare("SELECT id, role, member_id FROM users WHERE email = ?").get(email);

    if (existing) {
      db.prepare(`
        UPDATE users
        SET name = COALESCE(?, name), password = COALESCE(?, password),
            member_id = COALESCE(member_id, ?), library_card = COALESCE(library_card, ?),
            role = ?, updated_at = ?
        WHERE id = ?
      `).run(
        valueOf(row, "name"), valueOf(row, "password"), memberId,
        valueOf(row, "library_card", "libraryCard"),
        pickRole(existing.role, row.role), updatedAt, existing.id
      );
      continue;
    }

    const safeMemberId = exists("users", "member_id", memberId) ? null : memberId;
    db.prepare(`
      INSERT INTO users (member_id, name, email, password, library_card, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      safeMemberId, valueOf(row, "name") || "Library User", email,
      valueOf(row, "password") || "", valueOf(row, "library_card", "libraryCard"),
      pickRole(row.role), createdAt, updatedAt
    );
  }

  source.db.close();
}

// Books: Catalog is the source of truth; BetLog legacy books are folded in.
for (const sourcePath of [
  "catalog/data/libraTrack.db",
  "betlog/data/betlog.db"
]) {
  const source = openSource(sourcePath);
  if (!source) continue;

  for (const row of [
    ...readRows(source, "Books"),
    ...readRows(source, "books").filter((book) => !hasTable(source.db, "Books"))
  ]) {
    const isbn = valueOf(row, "isbn") || `LEGACY-${path.basename(sourcePath, ".db")}-${row.id}`;
    if (exists("books", "isbn", isbn)) continue;

    const totalCopies = Number(valueOf(row, "totalCopies", "copies") || 1);
    const availableCopies = Number(valueOf(row, "availableCopies", "available") ?? totalCopies);
    const createdAt = valueOf(row, "created_at", "createdAt") || now;
    const updatedAt = valueOf(row, "updated_at", "updatedAt") || now;
    const sourceId = Number(row.id) || null;
    const id = sourceId && exists("books", "id", sourceId) ? null : sourceId;

    db.prepare(`
      INSERT INTO books
        (id, title, author, isbn, category, shelf, total_copies, available_copies,
         borrow_count, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, valueOf(row, "title") || "Untitled", valueOf(row, "author") || "Unknown",
      isbn, valueOf(row, "category", "genre") || "Uncategorized",
      valueOf(row, "shelf") || "UNSHELVED", totalCopies, availableCopies,
      Number(valueOf(row, "borrowCount") || 0),
      valueOf(row, "status") || (availableCopies > 0 ? "available" : "unavailable"),
      createdAt, updatedAt
    );
  }

  source.db.close();
}

// Borrow logs: BetLog requests and old Catalog loans become one table.
for (const sourcePath of [
  "betlog/data/betlog.db",
  "catalog/data/libraTrack.db"
]) {
  const source = openSource(sourcePath);
  if (!source) continue;

  const legacyLoans = hasTable(source.db, "borrowings")
    ? []
    : [...readRows(source, "Loans"), ...readRows(source, "loans")];

  for (const row of [...readRows(source, "borrowings"), ...legacyLoans]) {
    const rawStatus = String(valueOf(row, "status") || "pending") === "borrowed"
      ? "active"
      : valueOf(row, "status") || "pending";
    const status = normalizeBorrowingStatus(rawStatus);
    const createdAt = valueOf(row, "created_at", "createdAt") || now;
    const updatedAt = valueOf(row, "updated_at", "updatedAt") || now;
    const sourceId = Number(row.id) || null;
    const id = sourceId && exists("borrowings", "id", sourceId) ? null : sourceId;

    db.prepare(`
      INSERT INTO borrowings
        (id, user_id, book_id, borrow_date, due_date, return_date, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, Number(valueOf(row, "userId", "UserId") || 0),
      Number(valueOf(row, "bookId", "BookId") || 0),
      toDate(valueOf(row, "borrow_date", "borrowDate") || createdAt),
      toDate(valueOf(row, "due_date", "dueDate")),
      toDate(valueOf(row, "return_date", "returnDate", "returnedAt")),
      status, valueOf(row, "notes"), createdAt, updatedAt
    );
  }

  source.db.close();
}

const counts = Object.fromEntries(
  ["users", "books", "borrowings"].map((table) => [
    table,
    db.prepare(`SELECT COUNT(*) AS total FROM ${quote(table)}`).get().total
  ])
);

console.log(`✅ Shared database ready: ${target}`);
console.log(`   users=${counts.users} books=${counts.books} borrowings=${counts.borrowings}`);
db.close();
