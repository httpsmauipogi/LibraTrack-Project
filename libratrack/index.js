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
    
import express from "express";
import path from "path";
import session from "express-session";
import flash from "connect-flash";
import router from "./routes/index.js";
import fs from 'fs';
import hbs from "hbs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";
import { randomBytes } from "crypto";
import { connectDatabase } from "./models/db.js";
import { registerHelpers, registerSharedPartials } from "../shared/hbs-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sharedRoot = path.join(__dirname, "..", "shared");
registerHelpers(hbs);

const app = express();
const PORT = process.env.PORT || 3000;
const sessionSecret = process.env.SESSION_SECRET || (
  process.env.NODE_ENV === "production" ? null : randomBytes(32).toString("hex")
);

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set in production.");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  }
}));
app.use(flash());

app.engine("xian", async (filePath, options, callback) => {
  try {
     const originalPartialsDir = hbs.partialsDir;
    hbs.partialsDir = path.join(__dirname, 'views');

    const result = await new Promise((resolve, reject) => {
      hbs.__express(filePath, options, (err, html) => {
        if (err) return reject(err);
        resolve(html);
      });
    });

    hbs.partialsDir = originalPartialsDir;
    callback(null, result);
  } catch (err) {
    callback(err);
  }
});
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.currentUser = req.session?.user || null;
  res.locals.isAdmin = req.session?.user?.role === "admin";
  res.locals.currentPath = req.path;
  res.locals.reviewUrl = "/admin/requests";
  res.locals.catalogUrl = new URL("/books", process.env.CATALOG_URL || "http://localhost:3001").toString();
  // Borrow Review never asks for a login, so hide auth controls there too.
  res.locals.hideAuthLinks = req.path === "/admin" || req.path.startsWith("/admin/");
  next();
});


app.set("views", path.join(__dirname, "views"));
app.set("view engine", "xian");
// Shared theme first, then app-specific overrides. Synchronous so the first
// request cannot render before partials are available.
registerSharedPartials(hbs, { fs, path, appRoot: __dirname, sharedRoot });

app.use("/", router);

export default app;

// Start the HTTP server; resolves once the server is listening.
// Exported so the Electron main process can control startup itself.
export const startServer = async (port = PORT) => {
  const dbReady = await connectDatabase();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const actualPort = server.address().port;
      console.log(`🔥 XianFire running at http://localhost:${actualPort}`);
      if (!dbReady) {
        console.log("ℹ️ Database fallback mode is active. Data is kept in memory only; check the database configuration to enable persistence.");
      }
      resolve(server);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        const fallbackServer = app.listen(0, () => {
          const actualPort = fallbackServer.address().port;
          console.log(`⚠️ Port ${port} in use. Fallback server running at http://localhost:${actualPort}`);
          if (!dbReady) {
            console.log("ℹ️ Database fallback mode is active. Data is kept in memory only; check the database configuration to enable persistence.");
          }
          resolve(fallbackServer);
        });
        fallbackServer.on("error", reject);
        return;
      }
      reject(error);
    });
  });
};

// Auto-start only when executed directly (node index.js).
// When imported by electron/main.js, Electron manages the server lifecycle.
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun && !process.env.XIAN_ELECTRON) {
  startServer().catch((error) => {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  });
}
