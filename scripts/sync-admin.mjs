import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcrypt";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "data", "shared.db");

const email = String(process.env.ADMIN_EMAIL || "library.admin@gmail.com").trim().toLowerCase();
const name = process.env.ADMIN_NAME || "Admin User";
const password = process.env.ADMIN_PASSWORD;

if (!password) {
  console.error("ADMIN_PASSWORD is required. Example:");
  console.error("  ADMIN_PASSWORD='your-password' npm run admin:sync");
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.log("Shared database not found; creating it from the existing app databases...");
  execFileSync(process.execPath, [path.join(root, "scripts", "migrate-shared-db.mjs")], {
    stdio: "inherit"
  });
}

// One hash in one database means the same credentials work in all three portals.
const passwordHash = bcrypt.hashSync(password, 10);
const db = new DatabaseSync(dbPath);

try {
  const now = new Date().toISOString();

  // There is only one administrator across the whole system.
  db.prepare("UPDATE users SET role = 'member' WHERE role = 'admin' AND email <> ?")
    .run(email);

  const memberIdTaken = db.prepare("SELECT id FROM users WHERE member_id = ? AND email <> ?")
    .get("ADM-2026-001", email);
  const memberId = memberIdTaken ? `ADM-${Date.now()}` : "ADM-2026-001";
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET name = ?, password = ?, role = 'admin', member_id = COALESCE(member_id, ?), updated_at = ?
      WHERE id = ?
    `).run(name, passwordHash, memberId, now, existing.id);
    console.log(`✅ Shared database: updated admin ${email}`);
  } else {
    db.prepare(`
      INSERT INTO users (member_id, name, email, password, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', ?, ?)
    `).run(memberId, name, email, passwordHash, now, now);
    console.log(`✅ Shared database: created admin ${email}`);
  }

  const total = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get().total;
  console.log(`✅ Administrator accounts in shared database: ${total}`);
} finally {
  db.close();
}
