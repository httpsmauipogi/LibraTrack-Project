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
import router from "./routes/index.js";
import fs from 'fs';
import hbs from "hbs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";
import { connectDatabase } from "./models/db.js";
import { publicAdmin } from "../shared/public-admin.js";
import { registerHelpers, registerSharedPartials } from "../shared/hbs-helpers.js";
import { portalBase } from "../shared/portal-url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sharedRoot = path.join(__dirname, "..", "shared");
registerHelpers(hbs);

export const resolvePort = (preferredPort, busyPorts = new Set()) => {
  let candidate = Number(preferredPort) || 3000;
  while (busyPorts.has(candidate)) {
    candidate += 1;
  }
  return candidate;
};

const app = express();
const PORT = Number(process.env.PORT) || 3000;

if (process.env.TRUST_PROXY) {
  const trustProxy = process.env.TRUST_PROXY;
  app.set(
    "trust proxy",
    trustProxy === "true" ? true : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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
  res.locals.success_msg = [];
  res.locals.error_msg = [];
  res.locals.currentPath = req.path;
  res.locals.reviewUrl = `${portalBase(req, "BETLOG_URL", 3002)}/admin/borrowings`;
  res.locals.catalogUrl = "/books";
  res.locals.adminConsoleUrl = portalBase(req, "ADMIN_URL", 3000);
  // Catalog Admin is permanently public: no sessions, no auth UI.
  res.locals.hideReviewLink = true;
  res.locals.hideAuthLinks = true;
  res.locals.currentUser = publicAdmin();
  next();
});


app.set("views", path.join(__dirname, "views"));
app.set("view engine", "xian");
registerSharedPartials(hbs, { fs, path, appRoot: __dirname, sharedRoot });

app.use("/", router);

export default app;

// Start the HTTP server; resolves once the server is listening.
// Exported so the Electron main process can control startup itself.
export const startServer = async (port = PORT) => {
  await connectDatabase();
  const busyPorts = new Set();

  return new Promise((resolve, reject) => {
    const tryListen = (candidatePort) => {
      const server = app.listen(candidatePort, () => {
        console.log(`🔥 XianFire running at http://localhost:${server.address().port}`);
        resolve(server);
      });

      server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          busyPorts.add(candidatePort);
          const nextPort = resolvePort(candidatePort + 1, busyPorts);
          console.warn(`Port ${candidatePort} is busy. Retrying on ${nextPort}.`);
          server.close(() => tryListen(nextPort));
          return;
        }

        reject(error);
      });
    };

    tryListen(port);
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
