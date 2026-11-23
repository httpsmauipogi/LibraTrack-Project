
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
import { Sequelize } from "sequelize";

const appRoot = process.cwd();
const dataDir = path.join(appRoot, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const getDatabaseConfig = (env = process.env) => {
  const dialectName = String(env.DB_DIALECT || "sqlite").toLowerCase();

  if (dialectName === "mysql" || dialectName === "mariadb") {
    return {
      dialect: "mysql",
      host: env.DB_HOST || "localhost",
      port: Number(env.DB_PORT || 3306),
      username: env.DB_USER || env.DB_USERNAME || "root",
      password: env.DB_PASS || env.DB_PASSWORD || "",
      database: env.DB_NAME || "libraTrackIndividual",
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
      database: env.DB_NAME || "libraTrackIndividual",
      logging: false
    };
  }

  return {
    dialect: "sqlite",
    storage: path.join(dataDir, "libraTrack.db"),
    logging: false
  };
};

export const sequelize = new Sequelize(getDatabaseConfig());