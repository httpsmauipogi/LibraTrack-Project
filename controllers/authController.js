
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
    
import crypto from "crypto";
import { User, sequelize } from "../models/userModel.js";
import { Book } from "../models/Book.js";
import { Borrowing } from "../models/Borrowing.js";
await sequelize.sync();

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
};

const comparePassword = (password, stored) => {
  const [salt, hash] = stored.split(":");
  const compute = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return compute === hash;
};

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
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });
  if (!user) return res.send("User not found");
  const match = comparePassword(password, user.password);
  if (!match) return res.send("Incorrect password");
  req.session.userId = user.id;
  res.redirect("/dashboard");
};

export const registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  const hashed = hashPassword(password);
  const user = await User.create({ name, email, password: hashed });
  req.session.userId = user.id;
  res.redirect("/dashboard");
};

export const logoutUser = (req, res) => {
  req.session.destroy();
  res.redirect("/login");
};
