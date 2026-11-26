/*
    MIT License

    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Sequelize } from "sequelize";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedDataDir = path.resolve(appRoot, "..", "data");

export const getDatabaseConfig = (env = process.env) => {
  const dialect = String(env.DB_DIALECT || "sqlite").toLowerCase();

  if (dialect === "mysql" || dialect === "mariadb") {
    return {
      dialect: "mysql",
      host: env.DB_HOST || "localhost",
      port: Number(env.DB_PORT || 3306),
      username: env.DB_USER || env.DB_USERNAME || "root",
      password: env.DB_PASS || env.DB_PASSWORD || "",
      database: env.DB_NAME || "LibraTrack",
      logging: false,
      dialectOptions: {
        connectTimeout: Number(env.DB_CONNECT_TIMEOUT || 20000)
      }
    };
  }

  // Zero-config default: one SQLite file shared by all three portals.
  // env.DB_STORAGE can still point somewhere else (e.g. :memory: for tests).
  const storage = env.DB_STORAGE
    ? (env.DB_STORAGE === ":memory:" || path.isAbsolute(env.DB_STORAGE)
        ? env.DB_STORAGE
        : path.resolve(appRoot, env.DB_STORAGE))
    : path.join(sharedDataDir, "shared.db");

  if (storage !== ":memory:") fs.mkdirSync(path.dirname(storage), { recursive: true });

  return {
    dialect: "sqlite",
    storage,
    logging: false
  };
};

export const databaseConfig = getDatabaseConfig();
export const isMySql = databaseConfig.dialect === "mysql";

export const sequelize = new Sequelize(databaseConfig);

const quoteIdentifier = (identifier) => `\`${String(identifier).replace(/`/g, "``")}\``;

const createMySqlDatabase = async () => {
  // Connect without selecting a database so an uninitialized MySQL server
  // still works: the database is created here before the app connects to it.
  const serverSequelize = new Sequelize({
    dialect: "mysql",
    host: databaseConfig.host,
    port: databaseConfig.port,
    username: databaseConfig.username,
    password: databaseConfig.password,
    logging: false,
    dialectOptions: databaseConfig.dialectOptions
  });

  try {
    await serverSequelize.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(databaseConfig.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await serverSequelize.close();
  }
};

// Databases created before `memberId` was added to the User model have no
// `member_id` column. SQLite cannot add a UNIQUE column with ALTER TABLE, so
// rebuild the table and copy existing rows before Sequelize syncs it.
const migrateLegacySqliteUsers = async () => {
  const [columns] = await sequelize.query("PRAGMA table_info(`users`)");
  if (columns.length === 0 || columns.some((column) => column.name === "member_id")) {
    return;
  }

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`
      CREATE TABLE users_migrate (
        id INTEGER PRIMARY KEY,
        member_id VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        library_card VARCHAR(255),
        role VARCHAR(32) NOT NULL DEFAULT 'member',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
    `, { transaction });
    await sequelize.query(`
      INSERT INTO users_migrate (id, name, email, password, library_card, role, created_at, updated_at)
      SELECT id, name, email, password, NULL, role, created_at, updated_at FROM users
    `, { transaction });
    await sequelize.query("DROP TABLE `users`", { transaction });
    await sequelize.query("ALTER TABLE `users_migrate` RENAME TO `users`", { transaction });
  });
};

export const connectDatabase = async () => {
  if (isMySql) {
    await createMySqlDatabase();
  }

  await sequelize.authenticate();
  if (!isMySql) {
    await migrateLegacySqliteUsers();
  }
  // Importing models registers them on `sequelize`, so sync creates every table.
  // The shared schema is created by scripts/migrate-shared-db.mjs. Plain sync
  // is safe with SQLite foreign keys; `alter` rebuilds parent tables and fails
  // when borrowings reference users/books.
  await sequelize.sync();

  const location = isMySql
    ? `${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`
    : databaseConfig.storage;
  console.log(`✅ Connected to ${isMySql ? "MySQL" : "SQLite"} database: ${location}`);
  return true;
};
