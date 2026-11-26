import { Book, Borrowing, sequelize } from "../models/index.js";
import { Op } from "sequelize";

const OPEN_STATUSES = ["pending", "approved", "active", "borrowed", "overdue"];
const today = () => new Date().toISOString().slice(0, 10);

export const book = {
  index: async (req, res) => {
    const { q, genre } = req.query;
    const where = {};
    if (genre) where.category = genre;
    if (q) {
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { author: { [Op.like]: `%${q}%` } }
      ];
    }
    const books = await Book.findAll({ where, order: [["title", "ASC"]] });
    const categories = await Book.findAll({
      attributes: [[sequelize.fn("DISTINCT", sequelize.col("category")), "category"]],
      where: { category: { [Op.ne]: null } },
      raw: true
    });
    res.render("books", {
      title: "Library Catalog",
      books,
      genres: categories.map((entry) => entry.category).filter(Boolean),
      q,
      genre
    });
  },

  show: async (req, res) => {
    const book = await Book.findByPk(req.params.id);
    if (!book) return res.status(404).send("Book not found");
    const alreadyBorrowed = req.session.userId
      ? await Borrowing.findOne({
          where: { bookId: book.id, userId: req.session.userId, status: OPEN_STATUSES }
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
    if (book.status === "unavailable" || book.availableCopies <= 0) {
      req.flash("error_msg", "This book is currently unavailable.");
      return res.redirect(`/books/${book.id}`);
    }
    const existing = await Borrowing.findOne({
      where: { bookId: book.id, userId: req.session.userId, status: OPEN_STATUSES }
    });
    if (existing) {
      req.flash("error_msg", "You already have an active or pending borrowing for this book.");
      return res.redirect(`/books/${book.id}`);
    }
    await Borrowing.create({
      userId: req.session.userId,
      bookId: book.id,
      borrowDate: today(),
      status: "pending",
      notes: "Borrow request submitted via library catalog."
    });
    req.flash("success_msg", "Borrow request submitted. Awaiting approval.");
    res.redirect("/borrowings");
  },

  // ---- Admin: manage books (same shared table Catalog Admin uses) ----
  manage: async (req, res) => {
    const books = await Book.findAll({ order: [["title", "ASC"]] });
    res.render("manage-books", { title: "Manage Books", books });
  },

  createForm: (req, res) => {
    res.render("book-form", { title: "Add Book", book: null });
  },

  create: async (req, res) => {
    const title = String(req.body.title || "").trim();
    const author = String(req.body.author || "").trim();
    if (!title || !author) {
      req.flash("error_msg", "Title and author are required.");
      return res.redirect("/admin/books/create");
    }
    const totalCopies = Number.parseInt(req.body.totalCopies ?? req.body.copies, 10) || 1;
    await Book.create({
      title,
      author,
      category: String(req.body.category || req.body.genre || "Uncategorized").trim(),
      shelf: String(req.body.shelf || "UNSHELVED").trim(),
      isbn: String(req.body.isbn || `BET-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`),
      totalCopies,
      availableCopies: totalCopies,
      borrowCount: 0,
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
    const newCopies = Number.parseInt(req.body.totalCopies ?? req.body.copies, 10) || 1;
    const borrowed = book.totalCopies - book.availableCopies;
    book.title = String(req.body.title || book.title).trim();
    book.author = String(req.body.author || book.author).trim();
    book.category = String(req.body.category || req.body.genre || book.category || "Uncategorized").trim();
    book.totalCopies = newCopies;
    book.availableCopies = Math.max(0, newCopies - borrowed);
    book.status = book.availableCopies > 0 ? "available" : "unavailable";
    await book.save();
    req.flash("success_msg", "Book updated.");
    res.redirect("/admin/books");
  },

  remove: async (req, res) => {
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      req.flash("error_msg", "Book not found.");
      return res.redirect("/admin/books");
    }
    const borrowingHistory = await Borrowing.count({ where: { bookId: book.id } });
    if (borrowingHistory) {
      req.flash("error_msg", "This book has borrowing history and cannot be removed.");
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
    const borrowed = book.totalCopies - book.availableCopies;
    if (book.status === "available") {
      book.status = "unavailable";
      book.availableCopies = 0;
    } else {
      book.status = "available";
      book.availableCopies = Math.max(0, book.totalCopies - borrowed);
    }
    await book.save();
    req.flash("success_msg", "Book status updated.");
    res.redirect("/admin/books");
  }
};
