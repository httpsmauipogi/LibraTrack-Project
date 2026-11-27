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
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { Op } from "sequelize";
import { User, Book, Borrowing, sequelize } from "../models/index.js";
import { publicAdmin } from "../../shared/public-admin.js";
import { portalBase } from "../../shared/portal-url.js";
import {
  ACTIVE_STATUSES,
  REVIEW_STATUSES,
  isReviewStatus,
  normalizeBorrowingStatus,
  statusLabel,
  statusQueryVariants
} from "../../shared/borrowing-status.js";

const SALT_ROUNDS = 10;
const MAX_FAILED_LOGINS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const today = () => new Date().toISOString().slice(0, 10);
const dueInDays = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// Demo accounts only. Passwords are stored as bcrypt hashes, never as plain text.
const demoUsers = [
  {
    id: "MEM-2026-001",
    name: "Library Member One",
    email: "member.one@libra.local",
    passwordHash: bcrypt.hashSync("password123", SALT_ROUNDS),
    role: "member"
  },
  {
    id: "MEM-2026-002",
    name: "Library Member Two",
    email: "member.two@libra.local",
    passwordHash: bcrypt.hashSync("password123", SALT_ROUNDS),
    role: "member"
  }
];

export const libraryStore = {
  holds: [],
  loans: []
};

// Books come only from the catalog admin. The member portal proxies the
// catalog API so every book list stays in sync with catalog additions.
export const fetchCatalogBooks = async () => {
  try {
    const base = process.env.CATALOG_URL || "http://localhost:3001";
    const response = await fetch(`${base}/api/books`, {
      signal: AbortSignal.timeout(2000)
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((book) => ({
      ...book,
      total: book.totalCopies ?? book.total ?? 0,
      available: book.availableCopies ?? book.available ?? 0,
      accent: "from-indigo-700 to-libra-deep"
    }));
  } catch {
    return [];
  }
};

// Short-lived, in-memory throttle for failed logins (per client + email).
const failedLogins = new Map();

const attemptKey = (req, email) => `${req.ip || req.socket?.remoteAddress || "unknown"}:${email}`;

const readAttempts = (key) => {
  const attempts = failedLogins.get(key);
  if (!attempts) return { count: 0, firstAt: 0 };
  if (Date.now() - attempts.firstAt > LOGIN_WINDOW_MS) {
    failedLogins.delete(key);
    return { count: 0, firstAt: 0 };
  }
  return attempts;
};

const isRateLimited = (key) => readAttempts(key).count >= MAX_FAILED_LOGINS;

const recordFailedLogin = (key) => {
  const attempts = readAttempts(key);
  failedLogins.set(key, { count: attempts.count + 1, firstAt: attempts.firstAt || Date.now() });
};

const clearFailedLogins = (key) => failedLogins.delete(key);

const getCurrentUser = (req) => {
  if (req.session && req.session.user) {
    return req.session.user;
  }

  return {
    id: "GUEST",
    name: "Guest User",
    email: "",
    role: "guest"
  };
};

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

const toSessionUser = (user) => ({
  id: user.memberId || user.id,
  name: user.name,
  email: normalizeEmail(user.email),
  role: user.role || "member"
});

// A fresh session on login/registration prevents session fixation.
const regenerateSession = (req) => new Promise((resolve, reject) => {
  req.session.regenerate((error) => (error ? reject(error) : resolve()));
});

const redirectWithError = (req, res, route, message, status = 302) => {
  req.flash("error_msg", message);
  return res.status(status).redirect(route);
};

export const homePage = (req, res) => {
  res.render("home", { title: "LibraTrack Home" });
};

export const loginPage = (req, res) => {
  res.render("login", { title: "Login Portal" });
};

export const registerPage = (req, res) => {
  res.render("register", { title: "Create Account" });
};

export const handleLogin = async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const candidatePassword = String(password || "");

  if (!normalizedEmail || !candidatePassword) {
    return redirectWithError(req, res, "/login", "Email and password are required.");
  }

  const key = attemptKey(req, normalizedEmail);
  if (isRateLimited(key)) {
    return redirectWithError(req, res, "/login", "Too many failed attempts. Please try again later.", 429);
  }

  let matchedUser = null;

  // Registered accounts live in the database and always use bcrypt hashes.
  try {
    const dbUser = await User.findOne({ where: { email: normalizedEmail } });
    if (dbUser && await bcrypt.compare(candidatePassword, dbUser.password)) {
      matchedUser = dbUser;
    }
  } catch (error) {
    console.warn("⚠️ Account lookup unavailable:", error.message);
  }

  // Demo accounts are kept in code so the portal works before any DB setup.
  if (!matchedUser) {
    const demoUser = demoUsers.find((entry) => entry.email === normalizedEmail);
    if (demoUser && await bcrypt.compare(candidatePassword, demoUser.passwordHash)) {
      matchedUser = demoUser;
    }
  }

  // Never create an account here: unknown credentials are simply rejected.
  if (!matchedUser) {
    recordFailedLogin(key);
    return redirectWithError(req, res, "/login", "Invalid email or password.");
  }

  clearFailedLogins(key);
  await regenerateSession(req);
  req.session.user = toSessionUser(matchedUser);
  return res.redirect("/dashboard");
};

export const handleRegister = async (req, res) => {
  const { firstName, lastName, email, password, confirmPassword } = req.body || {};
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  const normalizedEmail = normalizeEmail(email);
  const passwordText = String(password || "");

  if (!name || !normalizedEmail || !passwordText) {
    return redirectWithError(req, res, "/register", "All fields are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return redirectWithError(req, res, "/register", "Enter a valid email address.");
  }
  if (passwordText.length < 8) {
    return redirectWithError(req, res, "/register", "Password must be at least 8 characters long.");
  }
  if (passwordText !== String(confirmPassword || "")) {
    return redirectWithError(req, res, "/register", "Passwords do not match.");
  }
  if (demoUsers.some((entry) => entry.email === normalizedEmail)) {
    return redirectWithError(req, res, "/register", "That email is already registered.");
  }

  try {
    const existing = await User.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      return redirectWithError(req, res, "/register", "That email is already registered.");
    }

    const created = await User.create({
      memberId: `MEM-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      name,
      email: normalizedEmail,
      password: await bcrypt.hash(passwordText, SALT_ROUNDS),
      role: "member"
    });

    clearFailedLogins(attemptKey(req, normalizedEmail));
    await regenerateSession(req);
    req.session.user = toSessionUser(created);
    req.flash("success_msg", "Your account has been created.");
    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Registration failed:", error.message);
    return redirectWithError(req, res, "/register", "Registration is temporarily unavailable. Please try again.");
  }
};

export const logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};

export const dashboardPage = (req, res) => {
  const user = getCurrentUser(req);
  res.render("userDashboard", { title: "Member Dashboard", user });
};

const portalsFor = (req) => ({
  catalog: {
    base: portalBase(req, "CATALOG_URL", 3001),
    next: "/dashboard"
  },
  betlog: {
    base: portalBase(req, "BETLOG_URL", 3002),
    next: "/admin/borrowings"
  },
  requests: {
    base: "",
    next: "/admin/requests"
  }
});

// Both portals are public now, so the admin buttons link straight to them.
export const portalLogin = (req, res) => {
  const portal = portalsFor(req)[req.params.portal];
  if (!portal) return res.status(404).send("Unknown portal.");
  return res.redirect(`${portal.base}${portal.next}`);
};

// Public admin pages still render a name in their header; fall back to the
// shared display identity when no member session exists.
const consoleAdmin = (req) => req.session?.user || publicAdmin();

export const adminPage = async (req, res) => {
  const portals = portalsFor(req);
  let users = [];
  try {
    const records = await User.findAll({
      attributes: ["id", "memberId", "name", "email", "role", "createdAt"],
      order: [["createdAt", "DESC"]]
    });
    users = records.map((record) => ({
      memberId: record.memberId || `ID-${record.id}`,
      name: record.name,
      email: record.email,
      role: record.role,
      joined: record.createdAt ? new Date(record.createdAt).toISOString().split("T")[0] : ""
    }));
  } catch (error) {
    console.warn("⚠️ Could not load accounts for the admin page:", error.message);
  }

  const catalogBooks = await fetchCatalogBooks();
  const reviewRequests = await loadReviewRequests();
  let activeLoans = 0;
  try {
    activeLoans = await Borrowing.count({
      where: { status: { [Op.in]: statusQueryVariants(ACTIVE_STATUSES) } }
    });
  } catch (error) {
    console.warn("⚠️ Could not load borrowing stats:", error.message);
  }

  res.render("admin", {
    title: "Admin Portal",
    admin: consoleAdmin(req),
    users,
    portals: [
      {
        label: "Catalog Admin",
        description: "Add, edit, and remove books. Opens the catalog directly.",
        url: `${portals.catalog.base}${portals.catalog.next}`
      },
      {
        label: "Borrow Review",
        description: "Review borrow requests submitted from the member dashboard.",
        url: `${portals.requests.base}${portals.requests.next}`
      },
      {
        label: "Borrowed Books",
        description: "View books currently borrowed or returned in the borrow portal.",
        url: `${portals.betlog.base}${portals.betlog.next}`
      }
    ],
    stats: {
      books: catalogBooks.length,
      requests: reviewRequests.length,
      loans: activeLoans
    }
  });
};

const serializeAdminRequest = (record) => {
  const row = record.get({ plain: true });
  const book = row.book || {};
  const member = row.user || {};
  const status = normalizeBorrowingStatus(row.status);
  return {
    id: row.id,
    requestId: `REQ-${row.id}`,
    bookId: row.bookId,
    bookTitle: book.title || "Book",
    author: book.author || "",
    shelf: book.shelf || "",
    isbn: book.isbn || "",
    memberId: member.memberId || `ID-${row.userId}`,
    memberName: member.name || "Library Member",
    memberEmail: member.email || "",
    note: row.notes || "",
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : "",
    status,
    statusLabel: statusLabel(status)
  };
};

const loadReviewRequests = async () => {
  try {
    const records = await Borrowing.findAll({
      where: { status: { [Op.in]: statusQueryVariants(REVIEW_STATUSES) } },
      include: [
        { model: Book, as: "book" },
        { model: User, as: "user" }
      ],
      order: [["createdAt", "ASC"]]
    });
    return records.map(serializeAdminRequest);
  } catch (error) {
    console.warn("⚠️ Could not load borrow requests:", error.message);
    return [];
  }
};

const findReviewableRequest = (id) => Borrowing.findOne({
  where: {
    id,
    status: { [Op.in]: statusQueryVariants(REVIEW_STATUSES) }
  },
  include: [
    { model: Book, as: "book" },
    { model: User, as: "user" }
  ]
});

// Requests awaiting review are listed here and on the main admin console.
// Approving one turns it into an active borrowing in the shared ledger.
export const adminRequestsPage = async (req, res) => {
  res.render("adminRequests", {
    title: "Borrow Requests",
    admin: consoleAdmin(req),
    requests: await loadReviewRequests()
  });
};

export const approveAdminRequest = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    req.flash("error_msg", "Invalid borrow request.");
    return res.redirect("/admin/requests");
  }

  try {
    const borrowing = await findReviewableRequest(id);
    if (!borrowing || !isReviewStatus(borrowing.status)) {
      req.flash("error_msg", "Borrow request not found or already reviewed.");
      return res.redirect("/admin/requests");
    }

    const book = borrowing.book;
    if (!book || book.availableCopies <= 0) {
      req.flash("error_msg", "This book has no available copies, so the request cannot be approved.");
      return res.redirect("/admin/requests");
    }

    const transaction = await sequelize.transaction();
    try {
      borrowing.borrowDate = today();
      borrowing.dueDate = dueInDays(7);
      borrowing.status = "active";
      await borrowing.save({ transaction });
      book.availableCopies -= 1;
      book.borrowCount = (book.borrowCount || 0) + 1;
      book.status = book.availableCopies > 0 ? "available" : "unavailable";
      await book.save({ transaction });
      await transaction.commit();
      req.flash("success_msg", `REQ-${borrowing.id} approved and added to borrowed books.`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.warn("⚠️ Could not approve borrow request:", error.message);
    req.flash("error_msg", "Could not approve this borrow request.");
  }
  return res.redirect("/admin/requests");
};

export const rejectAdminRequest = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    req.flash("error_msg", "Invalid borrow request.");
    return res.redirect("/admin/requests");
  }

  try {
    const borrowing = await findReviewableRequest(id);
    if (!borrowing || !isReviewStatus(borrowing.status)) {
      req.flash("error_msg", "Borrow request not found or already reviewed.");
      return res.redirect("/admin/requests");
    }
    borrowing.status = "rejected";
    await borrowing.save();
    req.flash("success_msg", `REQ-${borrowing.id} rejected.`);
  } catch (error) {
    console.warn("⚠️ Could not reject borrow request:", error.message);
    req.flash("error_msg", "Could not reject this borrow request.");
  }
  return res.redirect("/admin/requests");
};

export const getBooks = async (req, res) => {
  res.json(await fetchCatalogBooks());
};

export const getMemberHolds = (req, res) => {
  const currentUser = getCurrentUser(req);
  res.json(libraryStore.holds.filter((hold) => hold.memberId === currentUser.id));
};

// Member loans come from the shared borrowings table, so requests submitted in
// Borrowing Management appear on the member dashboard.
export const getMemberLoans = async (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser.email) return res.json([]);

  try {
    const account = await User.findOne({ where: { email: currentUser.email } });
    if (!account) return res.json([]);

    const records = await Borrowing.findAll({
      where: {
        userId: account.id,
        status: { [Op.in]: statusQueryVariants([...ACTIVE_STATUSES, "approved"]) }
      },
      include: [{ model: Book, as: "book", attributes: ["title", "author", "category", "shelf", "isbn"] }],
      order: [["createdAt", "DESC"]]
    });

    res.json(records.map((record) => {
      const row = record.get({ plain: true });
      const book = row.book || {};
      return {
        id: row.id,
        memberId: currentUser.id,
        bookId: row.bookId,
        bookTitle: book.title || "Book",
        title: book.title || "Book",
        author: book.author || "",
        category: book.category || "",
        shelf: book.shelf || "",
        isbn: book.isbn || "",
        borrowDate: row.borrowDate,
        dueDate: row.dueDate,
        status: "Borrowed"
      };
    }));
  } catch (error) {
    console.warn("⚠️ Could not load member loans:", error.message);
    res.json([]);
  }
};

// Demo accounts live only in code, so create their database identity on first
// request. The random password hash is never a usable shared credential.
const findOrCreateMemberAccount = async (currentUser) => {
  const email = normalizeEmail(currentUser.email);
  const [account] = await User.findOrCreate({
    where: { email },
    defaults: {
      name: currentUser.name || "Library Member",
      password: bcrypt.hashSync(randomBytes(32).toString("hex"), SALT_ROUNDS),
      role: "member"
    }
  });
  return account;
};

const serializeMemberRequest = (record, currentUser) => {
  const row = record.get({ plain: true });
  const book = row.book || {};
  const status = String(row.status || "pending");
  return {
    id: row.id,
    holdId: `REQ-${row.id}`,
    requestId: `REQ-${row.id}`,
    borrowingId: row.id,
    bookId: row.bookId,
    bookTitle: book.title || "Book",
    author: book.author || "",
    shelf: book.shelf || "",
    isbn: book.isbn || "",
    memberId: currentUser.id,
    memberName: currentUser.name,
    note: row.notes || "",
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : "",
    status: status.charAt(0).toUpperCase() + status.slice(1),
    rawStatus: status
  };
};

// Requests submitted here are the shared borrowings that BetLog reviews.
export const getMemberRequests = async (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser.email) return res.json([]);

  try {
    const account = await User.findOne({ where: { email: normalizeEmail(currentUser.email) } });
    if (!account) return res.json([]);

    const records = await Borrowing.findAll({
      where: {
        userId: account.id,
        status: { [Op.in]: statusQueryVariants(["pending", "rejected", "cancelled"]) }
      },
      include: [{ model: Book, as: "book", attributes: ["title", "author", "shelf", "isbn"] }],
      order: [["createdAt", "DESC"]]
    });
    res.json(records.map((record) => serializeMemberRequest(record, currentUser)));
  } catch (error) {
    console.warn("⚠️ Could not load member requests:", error.message);
    res.json([]);
  }
};

export const createMemberRequest = async (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser.email) return res.status(401).json({ error: "Sign in to request a book." });

  const bookId = Number.parseInt(req.body?.bookId, 10);
  if (!Number.isInteger(bookId)) {
    return res.status(400).json({ error: "Select a valid book." });
  }
  const note = String(req.body?.note || "").trim();

  try {
    const account = await findOrCreateMemberAccount(currentUser);
    const book = await Book.findByPk(bookId);
    if (!book) return res.status(404).json({ error: "Book not found." });

    const existing = await Borrowing.findOne({
      where: {
        userId: account.id,
        bookId,
        status: { [Op.in]: statusQueryVariants([...REVIEW_STATUSES, ...ACTIVE_STATUSES]) }
      }
    });
    if (existing) {
      return res.status(409).json({ error: "You already have an open request for this book." });
    }

    const borrowing = await Borrowing.create({
      userId: account.id,
      bookId,
      status: "pending",
      notes: note || "Borrow request submitted from member dashboard."
    });
    const record = await Borrowing.findByPk(borrowing.id, {
      include: [{ model: Book, as: "book", attributes: ["title", "author", "shelf", "isbn"] }]
    });
    res.status(201).json(serializeMemberRequest(record, currentUser));
  } catch (error) {
    console.warn("⚠️ Could not submit member request:", error.message);
    res.status(500).json({ error: "Could not submit your borrow request." });
  }
};

export const cancelMemberRequest = async (req, res) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser.email) return res.status(401).json({ error: "Sign in to cancel a request." });

  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid request." });

  try {
    const account = await User.findOne({ where: { email: normalizeEmail(currentUser.email) } });
    if (!account) return res.status(404).json({ error: "Request not found." });
    const borrowing = await Borrowing.findOne({
      where: {
        id,
        userId: account.id,
        status: { [Op.in]: statusQueryVariants(["pending"]) }
      }
    });
    if (!borrowing) return res.status(404).json({ error: "Pending request not found." });
    borrowing.status = "cancelled";
    await borrowing.save();
    res.json({ success: true, id });
  } catch (error) {
    console.warn("⚠️ Could not cancel member request:", error.message);
    res.status(500).json({ error: "Could not cancel this request." });
  }
};

export const createMemberHold = (req, res) => {
  const payload = req.body || {};
  const currentUser = getCurrentUser(req);
  const hold = {
    holdId: payload.holdId || `HLD-${Date.now()}`,
    bookId: payload.bookId,
    bookTitle: payload.bookTitle,
    shelf: payload.shelf,
    memberId: payload.memberId || currentUser.id,
    memberName: payload.memberName || currentUser.name,
    note: payload.note || "Counter pickup",
    createdAt: payload.createdAt || new Date().toISOString().split("T")[0],
    status: "Pending"
  };

  libraryStore.holds.unshift(hold);
  res.status(201).json(hold);
};

export const deleteMemberHold = (req, res) => {
  const { holdId } = req.params;
  const before = libraryStore.holds.length;
  libraryStore.holds = libraryStore.holds.filter((hold) => hold.holdId !== holdId);

  if (libraryStore.holds.length === before) {
    return res.status(404).json({ message: "Hold not found" });
  }

  return res.status(200).json({ success: true, removed: holdId });
};
