
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
import { User, sequelize } from "../models/userModel.js";
import "../models/bookModel.js";
import "../models/loanModel.js";
await sequelize.sync();

export const loginPage = (req, res) => res.render("login", { title: "Login", authCard: "login" });
export const dashboardPage = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  try {
    const user = await User.findByPk(req.session.userId, {
      attributes: ["id", "name", "email", "role"]
    });
    if (!user) {
      return req.session.destroy(() => res.redirect("/login"));
    }
    const account = user.get({ plain: true });
    const userInitials = account.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");

    if (account.role === "admin" || account.role === "staff") {
      return res.render("dashboard", {
        title: "Admin Dashboard",
        adminUser: account,
        adminInitials: userInitials
      });
    }

    return res.status(403).send("Patron access is temporarily unavailable while the user system is being integrated.");
  } catch (error) {
    console.error("Could not load account:", error);
    res.status(500).send("Could not load your account. Please try again.");
  }
};

export const loginUser = async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  try {
    const user = await User.findOne({ where: { email } });
    const match = user && (user.role === "admin" || user.role === "staff") && await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).render("login", {
        title: "Login",
        authCard: "login",
        authError: "Email or password is incorrect.",
        email
      });
    }

    req.session.regenerate((error) => {
      if (error) {
        return res.status(500).render("login", {
          title: "Login",
          authCard: "login",
          authError: "Could not start your session. Please try again.",
          email
        });
      }

      req.session.userId = user.id;
      req.session.save((saveError) => {
        if (saveError) {
          return res.status(500).render("login", {
            title: "Login",
            authCard: "login",
            authError: "Could not start your session. Please try again.",
            email
          });
        }
        res.redirect("/dashboard");
      });
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).render("login", {
      title: "Login",
      authCard: "login",
      authError: "Login is temporarily unavailable. Please try again.",
      email
    });
  }
};

export const logoutUser = (req, res) => {
  if (!req.session) return res.redirect("/");
  req.session.destroy(() => res.redirect("/"));
};
