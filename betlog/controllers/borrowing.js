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

import { Borrowing, sequelize } from "../models/Borrowing.js";
import { Book } from "../models/Book.js";
import { User } from "../models/userModel.js";

await sequelize.sync();

export const borrowing = {
  myBorrowings: async (req, res) => {
    if (!req.session.userId) return res.redirect("/login");
    const borrowings = await Borrowing.findAll({
      where: { userId: req.session.userId },
      include: [{ model: Book, as: "book" }],
      order: [["createdAt", "DESC"]]
    });
    res.render("borrowings", { title: "My Borrowings", borrowings });
  },

  returnItem: async (req, res) => {
    if (!req.session.userId) return res.redirect("/login");
    const user = await User.findByPk(req.session.userId);
    const isStaff = user && (user.role === "admin" || user.role === "staff");
    const redirect = isStaff ? "/admin/borrowings" : "/borrowings";
    const borrowing = await Borrowing.findByPk(req.params.id, { include: [{ model: Book, as: "book" }] });
    if (!borrowing) {
      req.flash("error_msg", "Borrowing record not found.");
      return res.redirect(redirect);
    }
    if (!isStaff && borrowing.userId !== req.session.userId) {
      req.flash("error_msg", "You can only return your own borrowings.");
      return res.redirect(redirect);
    }
    if (borrowing.status !== "active") {
      req.flash("error_msg", "Only active borrowings can be returned.");
      return res.redirect(redirect);
    }
    const transaction = await sequelize.transaction();
    try {
      borrowing.returnDate = new Date();
      borrowing.status = "returned";
      await borrowing.save({ transaction });
      const book = borrowing.book;
      book.available = (book.available || 0) + 1;
      if (book.available >= book.copies) book.status = "available";
      await book.save({ transaction });
      await transaction.commit();
      req.flash("success_msg", "Book returned successfully.");
    } catch (err) {
      await transaction.rollback();
req.flash("error_msg", "Failed to return book.");
    }
    res.redirect(redirect);
  },

  manage: async (req, res) => {
    const borrowings = await Borrowing.findAll({
      include: [{ model: Book, as: "book" }, { model: User, as: "user" }],
      order: [["createdAt", "DESC"]]
    });
    res.render("manage-borrowings", { title: "Manage Borrowings", borrowings });
  },

  approve: async (req, res) => {
    const borrowing = await Borrowing.findByPk(req.params.id, { include: [{ model: Book, as: "book" }] });
    if (!borrowing) {
      req.flash("error_msg", "Borrowing record not found.");
      return res.redirect("/admin/borrowings");
    }
    if (borrowing.status !== "pending") {
      req.flash("error_msg", "Only pending requests can be approved.");
      return res.redirect("/admin/borrowings");
    }
    const book = borrowing.book;
    if (book.available <= 0) {
      req.flash("error_msg", "Book is unavailable and cannot be approved.");
      return res.redirect("/admin/borrowings");
    }
    const transaction = await sequelize.transaction();
    try {
      const now = new Date();
      const due = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      borrowing.borrowDate = now;
      borrowing.dueDate = due;
      borrowing.status = "active";
      await borrowing.save({ transaction });
      book.available = (book.available || 0) - 1;
      if (book.available <= 0) book.status = "unavailable";
      await book.save({ transaction });
      await transaction.commit();
      req.flash("success_msg", "Borrowing approved.");
    } catch (err) {
      await transaction.rollback();
      req.flash("error_msg", "Failed to approve borrowing.");
    }
    res.redirect("/admin/borrowings");
  },

  reject: async (req, res) => {
    const borrowing = await Borrowing.findByPk(req.params.id);
    if (!borrowing) {
      req.flash("error_msg", "Borrowing record not found.");
      return res.redirect("/admin/borrowings");
    }
    if (borrowing.status !== "pending") {
      req.flash("error_msg", "Only pending requests can be rejected.");
      return res.redirect("/admin/borrowings");
    }
    borrowing.status = "rejected";
    await borrowing.save();
    req.flash("success_msg", "Borrowing request rejected.");
    res.redirect("/admin/borrowings");
  }
};