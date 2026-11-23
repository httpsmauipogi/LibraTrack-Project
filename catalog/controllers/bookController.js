import { Book } from "../models/bookModel.js";
import { Loan } from "../models/loanModel.js";
import { User } from "../models/userModel.js";
import { sequelize } from "../models/db.js";

const currentUser = async (req) => {
  if (!req.session.userId) return null;
  return User.findByPk(req.session.userId, { attributes: ["id", "role"] });
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
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in to manage the catalog." });
  if (user.role !== "admin" && user.role !== "staff") {
    return res.status(403).json({ error: "Only library staff can add books." });
  }

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
      borrowCount: 0
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
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in to manage the catalog." });
  if (user.role !== "admin" && user.role !== "staff") {
    return res.status(403).json({ error: "Only library staff can edit books." });
  }

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
    book.set({ title, author, isbn, category, shelf, totalCopies: quantity, availableCopies: quantity - checkedOut });
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
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in to manage the catalog." });
  if (user.role !== "admin" && user.role !== "staff") {
    return res.status(403).json({ error: "Only library staff can remove books." });
  }
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found." });
    const activeLoans = await Loan.count({ where: { BookId: book.id, status: "borrowed" } });
    if (activeLoans) return res.status(409).json({ error: "This book cannot be removed while it is borrowed." });
    await book.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error("Could not delete book:", error);
    res.status(500).json({ error: "Could not remove this book." });
  }
};

export const listMyLoans = async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in to view your loans." });
  if (user.role !== "admin" && user.role !== "staff") {
    return res.status(503).json({ error: "Patron loan access is temporarily unavailable while the user-system integration is being prepared." });
  }
  try {
    const loans = await Loan.findAll({
      include: [
        { model: Book, attributes: ["title", "author", "isbn"] },
        { model: User, attributes: ["id", "name", "email"] }
      ],
      order: [["createdAt", "DESC"]]
    });
    res.json(loans);
  } catch (error) {
    console.error("Could not load loans:", error);
    res.status(500).json({ error: "Could not load your borrowing history." });
  }
};

export const returnLoan = async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in to process returns." });
  if (user.role !== "admin" && user.role !== "staff") {
    return res.status(403).json({ error: "Only library staff can process returns." });
  }

  const transaction = await sequelize.transaction();
  try {
    const loan = await Loan.findByPk(req.params.id, {
      include: [{ model: Book }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!loan) {
      await transaction.rollback();
      return res.status(404).json({ error: "Loan not found." });
    }
    if (loan.status === "returned") {
      await transaction.rollback();
      return res.status(409).json({ error: "This loan has already been returned." });
    }

    loan.status = "returned";
    loan.returnedAt = new Date().toISOString().slice(0, 10);
    await loan.save({ transaction });
    if (loan.Book) {
      loan.Book.availableCopies = Math.min(loan.Book.totalCopies, loan.Book.availableCopies + 1);
      await loan.Book.save({ transaction });
    }
    await transaction.commit();
    res.json({ success: true, loan });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error("Could not process return:", error);
    res.status(500).json({ error: "Could not process this return." });
  }
};
