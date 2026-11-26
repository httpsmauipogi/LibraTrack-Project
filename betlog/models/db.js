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
export const isMySql = databaseConfig.dialect === "mysql";
export const sequelize = new Sequelize(databaseConfig);

export const connectDatabase = async () => {
  if (isMySql) {
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
        `CREATE DATABASE IF NOT EXISTS \`${String(databaseConfig.database).replace(/`/g, "``")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await serverSequelize.close();
    }
  }

  await sequelize.authenticate();
  // Model files are imported by the controllers, so all tables are registered.
  // One canonical schema is shared by every portal; do not rebuild tables.
  await sequelize.sync();

  const location = isMySql
    ? `${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`
    : databaseConfig.storage;
  console.log(`✅ Connected to ${isMySql ? "MySQL" : "SQLite"} database: ${location}`);
  return true;
};
