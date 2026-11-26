
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
import { User } from "../models/userModel.js";
import { Book } from "../models/Book.js";
import { Borrowing } from "../models/Borrowing.js";

const SALT_ROUNDS = 10;

// All three LibraTrack apps use bcrypt so one admin identity works everywhere.
const hashPassword = (password) => bcrypt.hash(String(password || ""), SALT_ROUNDS);

const comparePassword = (password, stored) => {
  if (typeof stored !== "string" || !/^\$2[aby]\$/.test(stored)) return Promise.resolve(false);
  return bcrypt.compare(String(password || ""), stored);
};

const regenerateSession = (req) => new Promise((resolve, reject) => {
  req.session.regenerate((error) => (error ? reject(error) : resolve()));
});

export const loginPage = (req, res) => res.render("login", { title: "Login" });
export const registerPage = (req, res) => res.render("register", { title: "Register" });
export const forgotPasswordPage = (req, res) => res.render("forgotpassword", { title: "Forgot Password" });
export const dashboardPage = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const user = await User.findByPk(req.session.userId);
  const totalBooks = await Book.count();
  const myActive = await Borrowing.count({
    where: { userId: req.session.userId, status: ["pending", "approved", "active"] }
  });
  const myReturned = await Borrowing.count({
    where: { userId: req.session.userId, status: "returned" }
  });
  const pendingAll = await Borrowing.count({ where: { status: "pending" } });
  const isStaff = user && (user.role === "admin" || user.role === "staff");
  const recent = await Borrowing.findAll({
    where: isStaff ? {} : { userId: req.session.userId },
    include: [{ model: Book, as: "book" }],
    order: [["createdAt", "DESC"]],
    limit: 5
  });
  res.render("dashboard", {
    title: "Dashboard",
    user,
    stats: {
      totalBooks,
      myActive,
      myReturned,
      pendingAll,
      isStaff
    },
    recent
  });
};

export const loginUser = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      req.flash("error_msg", "Email and password are required.");
      return res.redirect("/login");
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !(await comparePassword(password, user.password))) {
      req.flash("error_msg", "Invalid email or password.");
      return res.redirect("/login");
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Login failed:", error.message);
    req.flash("error_msg", "Sign in is temporarily unavailable. Please try again.");
    return res.redirect("/login");
  }
};

export const registerUser = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      req.flash("error_msg", "Enter a valid name and email address.");
      return res.redirect("/register");
    }
    if (password.length < 8) {
      req.flash("error_msg", "Password must be at least 8 characters long.");
      return res.redirect("/register");
    }
    if (await User.findOne({ where: { email } })) {
      req.flash("error_msg", "That email is already registered.");
      return res.redirect("/register");
    }

    const user = await User.create({ name, email, password: await hashPassword(password) });
    await regenerateSession(req);
    req.session.userId = user.id;
    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Registration failed:", error.message);
    req.flash("error_msg", "Registration is temporarily unavailable. Please try again.");
    return res.redirect("/register");
  }
};

export const logoutUser = (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
};

// Borrowed Books and its actions never require authentication, so legacy SSO
// links simply redirect through instead of creating a session.
export const ssoLogin = (req, res) => {
  const next = req.query.next;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/admin/borrowings";
  return res.redirect(target);
};
