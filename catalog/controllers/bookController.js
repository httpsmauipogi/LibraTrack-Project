import { Op } from "sequelize";
import { Book, Borrowing, User, sequelize } from "../models/index.js";
import {
  isActiveStatus,
  normalizeBorrowingStatus,
  statusLabel
} from "../../shared/borrowing-status.js";

// Public catalog site: read-only view of the same books Catalog Admin manages.
export const catalogPage = async (req, res) => {
  const q = String(req.query.q || "").trim();
  const category = String(req.query.category || "").trim();
  const where = {};
  if (category) where.category = category;
  if (q) {
    where[Op.or] = [
      { title: { [Op.like]: `%${q}%` } },
      { author: { [Op.like]: `%${q}%` } }
    ];
  }

  try {
    const books = await Book.findAll({ where, order: [["title", "ASC"]] });
    const categories = await Book.findAll({
      attributes: [[sequelize.fn("DISTINCT", sequelize.col("category")), "category"]],
      where: { category: { [Op.ne]: null } },
      raw: true
    });
    res.render("books", {
      title: "Library Catalog",
      books,
      categories: categories.map((entry) => entry.category).filter(Boolean),
      q,
      category
    });
  } catch (error) {
    console.error("Could not render the catalog:", error);
    res.status(500).send("Could not load the catalog. Please try again.");
  }
};

export const listBooks = async (req, res) => {
  try {
    const books = await Book.findAll({ order: [["title", "ASC"]] });
    res.json(books);
  } catch (error) {
    console.error("Could not load books:", error);
    res.status(500).json({ error: "Could not load the book catalog." });
  }
};

export const createBook = async (req, res) => {
  const title = String(req.body.title || "").trim();
  const author = String(req.body.author || "").trim();
  const isbn = String(req.body.isbn || "").trim();
  const category = String(req.body.category || "").trim();
  const shelf = String(req.body.shelf || "").trim();
  const quantity = Number.parseInt(req.body.quantity, 10);
  if (!title || !author || !isbn || !category || !shelf || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: "Complete all book fields and enter at least one copy." });
  }

  try {
    const book = await Book.create({
      title, author, isbn, category, shelf,
      totalCopies: quantity,
      availableCopies: quantity,
      borrowCount: 0,
      status: "available"
    });
    res.status(201).json(book);
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "A book with that ISBN already exists." });
    }
    console.error("Could not add book:", error);
    res.status(500).json({ error: "Could not save this book." });
  }
};

export const updateBook = async (req, res) => {
  const quantity = Number.parseInt(req.body.quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: "Enter at least one copy." });
  }
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found." });
    const checkedOut = book.totalCopies - book.availableCopies;
    if (quantity < checkedOut) {
      return res.status(409).json({ error: "Total copies cannot be less than the number currently borrowed." });
    }
    const title = String(req.body.title || "").trim();
    const author = String(req.body.author || "").trim();
    const isbn = String(req.body.isbn || "").trim();
    const category = String(req.body.category || "").trim();
    const shelf = String(req.body.shelf || "").trim();
    if (!title || !author || !isbn || !category || !shelf) {
      return res.status(400).json({ error: "Complete all book fields." });
    }
    const availableCopies = quantity - checkedOut;
    book.set({
      title, author, isbn, category, shelf,
      totalCopies: quantity,
      availableCopies,
      status: availableCopies > 0 ? "available" : "unavailable"
    });
    await book.save();
    res.json(book);
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "A book with that ISBN already exists." });
    }
    console.error("Could not update book:", error);
    res.status(500).json({ error: "Could not update this book." });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found." });
    const borrowingHistory = await Borrowing.count({ where: { bookId: book.id } });
    if (borrowingHistory) {
      return res.status(409).json({ error: "This book has borrowing history and cannot be removed." });
    }
    await book.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error("Could not delete book:", error);
    res.status(500).json({ error: "Could not remove this book." });
  }
};

// Borrow Logs read every record in the shared borrowings table. Keeping the
// canonical status lets the dashboard account for requests and loans separately.
export const listMyLoans = async (req, res) => {
  try {
    const records = await Borrowing.findAll({
      include: [
        { model: Book, as: "book", attributes: ["id", "title", "author", "isbn", "category", "shelf"] },
        { model: User, as: "user", attributes: ["id", "name", "email"] }
      ],
      order: [["createdAt", "DESC"]]
    });

    const loans = records.map((record) => {
      const row = record.get({ plain: true });
      const status = normalizeBorrowingStatus(row.status);
      return {
        ...row,
        Book: row.book || null,
        User: row.user || null,
        returnedAt: row.returnDate,
        status,
        rawStatus: status,
        statusLabel: statusLabel(status),
        isActiveLoan: isActiveStatus(status)
      };
    });
    res.json(loans);
  } catch (error) {
    console.error("Could not load loans:", error);
    res.status(500).json({ error: "Could not load borrowing history." });
  }
};

export const returnLoan = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const borrowing = await Borrowing.findByPk(req.params.id, {
      include: [{ model: Book, as: "book" }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!borrowing) {
      await transaction.rollback();
      return res.status(404).json({ error: "Loan not found." });
    }
    if (!isActiveStatus(borrowing.status)) {
      await transaction.rollback();
      return res.status(409).json({ error: "Only an active loan can be returned." });
    }

    borrowing.status = "returned";
    borrowing.returnDate = new Date().toISOString().slice(0, 10);
    await borrowing.save({ transaction });

    const book = borrowing.book;
    if (book) {
      book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);
      book.status = book.availableCopies > 0 ? "available" : "unavailable";
      await book.save({ transaction });
    }
    await transaction.commit();
    res.json({ success: true, loan: borrowing });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error("Could not process return:", error);
    res.status(500).json({ error: "Could not process this return." });
  }
};
