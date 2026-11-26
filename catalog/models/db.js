
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
  const dialectName = String(env.DB_DIALECT || "sqlite").toLowerCase();

  if (dialectName === "mysql" || dialectName === "mariadb") {
    return {
      dialect: "mysql",
      host: env.DB_HOST || "localhost",
      port: Number(env.DB_PORT || 3306),
      username: env.DB_USER || env.DB_USERNAME || "root",
      password: env.DB_PASS || env.DB_PASSWORD || "",
      database: env.DB_NAME || "LibraTrack",
      logging: false
    };
  }

  if (dialectName === "postgres" || dialectName === "postgresql") {
    return {
      dialect: "postgres",
      host: env.DB_HOST || "localhost",
      port: Number(env.DB_PORT || 5432),
      username: env.DB_USER || env.DB_USERNAME || "postgres",
      password: env.DB_PASS || env.DB_PASSWORD || "",
      database: env.DB_NAME || "LibraTrack",
      logging: false
    };
  }

  // All portals use the same SQLite file unless DB_STORAGE overrides it.
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
export const sequelize = new Sequelize(databaseConfig);

export const connectDatabase = async () => {
  if (databaseConfig.dialect === "mysql") {
    const serverSequelize = new Sequelize({
      dialect: "mysql",
      host: databaseConfig.host,
      port: databaseConfig.port,
      username: databaseConfig.username,
      password: databaseConfig.password,
      logging: false
    });
    try {
      await serverSequelize.query(
        `CREATE DATABASE IF NOT EXISTS \`${String(databaseConfig.database).replace(/`/g, "``")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await serverSequelize.close();
    }
  }

  await sequelize.authenticate();
  // Importing controllers registers every model on this Sequelize instance.
  // One canonical schema is shared by every portal; do not rebuild tables.
  await sequelize.sync();
  const location = databaseConfig.dialect === "sqlite"
    ? databaseConfig.storage
    : `${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`;
  console.log(`✅ Connected to ${databaseConfig.dialect} database: ${location}`);
  return true;
};