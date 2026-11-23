
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
import { User } from "../models/userModel.js";

const seedBooks = [
  { id: 101, title: "Clean Code: Agile Software Craftsmanship", author: "Robert C. Martin", isbn: "978-0132350884", category: "Computer Science", shelf: "CS-101-A", total: 5, available: 3, accent: "from-emerald-700 to-teal-900" },
  { id: 102, title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", isbn: "978-1449373320", category: "Computer Science", shelf: "CS-204-B", total: 4, available: 2, accent: "from-slate-700 to-slate-900" },
  { id: 103, title: "Introduction to Algorithms (CLRS)", author: "Thomas H. Cormen", isbn: "978-0262046305", category: "Computer Science", shelf: "CS-105-A", total: 3, available: 0, accent: "from-amber-700 to-orange-900" },
  { id: 104, title: "Noli Me Tángere", author: "José Rizal", isbn: "978-0143039693", category: "Literature", shelf: "LIT-012-C", total: 8, available: 6, accent: "from-stone-700 to-stone-900" },
  { id: 105, title: "The Pragmatic Programmer", author: "Andrew Hunt & David Thomas", isbn: "978-0135957059", category: "Computer Science", shelf: "CS-110-A", total: 4, available: 4, accent: "from-teal-700 to-emerald-950" },
  { id: 106, title: "Structures: Why Things Don’t Fall Down", author: "J.E. Gordon", isbn: "978-0306812835", category: "Engineering", shelf: "ENG-301-D", total: 3, available: 2, accent: "from-cyan-800 to-slate-900" }
];

const defaultUsers = [
  { id: "MEM-2026-001", name: "Library Member One", email: "member.one@libra.local", password: "password123", role: "member" },
  { id: "MEM-2026-002", name: "Library Member Two", email: "member.two@libra.local", password: "password123", role: "member" }
];

export const libraryStore = {
  books: [...seedBooks],
  holds: [
    { holdId: "HLD-1001", bookId: 101, bookTitle: "Clean Code: Agile Software Craftsmanship", shelf: "CS-101-A", memberId: "MEM-2026-001", memberName: "Library Member One", note: "Counter pickup", createdAt: "2026-11-17", status: "Pending" },
    { holdId: "HLD-1002", bookId: 104, bookTitle: "Noli Me Tángere", shelf: "LIT-012-C", memberId: "MEM-2026-001", memberName: "Library Member One", note: "Pickup after 2 PM", createdAt: "2026-11-17", status: "Pending" }
  ],
  loans: [
    { loanId: "LOAN-501", bookId: 102, bookTitle: "Designing Data-Intensive Applications", memberId: "MEM-2026-001", memberName: "Library Member One", borrowDate: "2026-10-14", dueDate: "2026-10-28", status: "Borrowed" }
  ]
};

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

const normalizeEmail = (value = "") => value.trim().toLowerCase();

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

  let user = defaultUsers.find(
    (entry) => normalizeEmail(entry.email) === normalizedEmail && entry.password === String(password || "")
  );

  try {
    const dbUser = await User.findOne({ where: { email: normalizedEmail } });
    if (dbUser && String(dbUser.password) === String(password || "")) {
      user = dbUser.toJSON();
    }
  } catch (error) {
    // ignore database unavailability; fallback remains in-memory
  }

  if (!user) {
    user = {
      id: "MEM-" + Date.now(),
      name: normalizedEmail ? normalizedEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "New User",
      email: normalizedEmail || "",
      role: "member"
    };
  }

  req.session.user = user;
  return res.redirect("/dashboard");
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

export const getBooks = (req, res) => {
  res.json(libraryStore.books);
};

export const getMemberHolds = (req, res) => {
  const currentUser = getCurrentUser(req);
  res.json(libraryStore.holds.filter((hold) => hold.memberId === currentUser.id));
};

export const getMemberLoans = (req, res) => {
  const currentUser = getCurrentUser(req);
  res.json(libraryStore.loans.filter((loan) => loan.memberId === currentUser.id));
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
