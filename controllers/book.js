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

import { Book, sequelize } from "../models/Book.js";
import { Borrowing } from "../models/Borrowing.js";
import { Op } from "sequelize";

await sequelize.sync();

export const book = {
  index: async (req, res) => {
    const { q, genre } = req.query;
    const where = {};
    if (genre) where.genre = genre;
    if (q) {
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { author: { [Op.like]: `%${q}%` } }
      ];
    }
    const books = await Book.findAll({ where, order: [["title", "ASC"]] });
    const genres = await Book.findAll({
      attributes: [[sequelize.fn("DISTINCT", sequelize.col("genre")), "genre"]],
      where: { genre: { [Op.ne]: null } },
      raw: true
    });
    res.render("books", {
      title: "Library Catalog",
      books,
      genres: genres.map((g) => g.genre).filter(Boolean),
      q,
      genre
    });
  },

  show: async (req, res) => {
    const book = await Book.findByPk(req.params.id);
    if (!book) return res.status(404).send("Book not found");
    const alreadyBorrowed = req.session.userId
      ? await Borrowing.findOne({
          where: { bookId: book.id, userId: req.session.userId, status: ["pending", "approved", "active"] }
        })
      : null;
    res.render("book", { title: book.title, book, alreadyBorrowed });
  },

  borrow: async (req, res) => {
    if (!req.session.userId) {
      req.flash("error_msg", "Please log in to borrow a book.");
      return res.redirect("/login");
    }
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      req.flash("error_msg", "Book not found.");
      return res.redirect("/books");
    }
    if (book.available <= 0) {
      req.flash("error_msg", "This book is currently unavailable.");
      return res.redirect(`/books/${book.id}`);
    }
    const existing = await Borrowing.findOne({
      where: { bookId: book.id, userId: req.session.userId, status: ["pending", "approved", "active"] }
    });
    if (existing) {
      req.flash("error_msg", "You already have an active or pending borrowing for this book.");
      return res.redirect(`/books/${book.id}`);
    }
    await Borrowing.create({
      userId: req.session.userId,
      bookId: book.id,
      status: "pending",
      notes: "Borrow request submitted via library catalog."
    });
    req.flash("success_msg", "Borrow request submitted. Awaiting approval.");
    res.redirect("/borrowings");
  },

  // ---- Admin: manage books ----
  manage: async (req, res) => {
    const books = await Book.findAll({ order: [["title", "ASC"]] });
    res.render("manage-books", { title: "Manage Books", books });
  },

  createForm: (req, res) => {
    res.render("book-form", { title: "Add Book", book: null });
  },

  create: async (req, res) => {
    const { title, author, genre, copies } = req.body;
    await Book.create({
      title,
      author,
      genre,
      copies: parseInt(copies) || 1,
      available: parseInt(copies) || 1,
      status: "available"
    });
    req.flash("success_msg", "Book added to the library.");
    res.redirect("/admin/books");
  },

  editForm: async (req, res) => {
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      req.flash("error_msg", "Book not found.");
      return res.redirect("/admin/books");
    }
    res.render("book-form", { title: "Edit Book", book });
  },

  update: async (req, res) => {
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      req.flash("error_msg", "Book not found.");
      return res.redirect("/admin/books");
    }
    const { title, author, genre, copies } = req.body;
    const newCopies = parseInt(copies) || 1;
    const borrowed = book.copies - book.available;
    await book.update({
      title,
      author,
      genre,
      copies: newCopies,
      available: Math.max(0, newCopies - borrowed),
      status: "available"
    });
    req.flash("success_msg", "Book updated.");
    res.redirect("/admin/books");
  },

  remove: async (req, res) => {
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      req.flash("error_msg", "Book not found.");
      return res.redirect("/admin/books");
    }
    await book.destroy();
    req.flash("success_msg", "Book removed.");
    res.redirect("/admin/books");
  },

  toggle: async (req, res) => {
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      req.flash("error_msg", "Book not found.");
      return res.redirect("/admin/books");
    }
    book.status = book.status === "available" ? "unavailable" : "available";
    await book.save();
    req.flash("success_msg", "Book status updated.");
    res.redirect("/admin/books");
  }
};