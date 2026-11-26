import { Borrowing, Book, User, sequelize } from "../models/index.js";
import {
  isActiveStatus,
  isReviewStatus,
  normalizeBorrowingStatus,
  statusLabel
} from "../../shared/borrowing-status.js";

const today = () => new Date().toISOString().slice(0, 10);
const dueInDays = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

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

  completeReturn: async (req, res, redirect, ownerId = null) => {
    const borrowing = await Borrowing.findByPk(req.params.id, { include: [{ model: Book, as: "book" }] });
    if (!borrowing) {
      req.flash("error_msg", "Borrowing record not found.");
      return res.redirect(redirect);
    }
    if (ownerId && borrowing.userId !== ownerId) {
      req.flash("error_msg", "You can only return your own borrowings.");
      return res.redirect(redirect);
    }
    if (!isActiveStatus(borrowing.status)) {
      req.flash("error_msg", "Only active borrowings can be returned.");
      return res.redirect(redirect);
    }
    const transaction = await sequelize.transaction();
    try {
      borrowing.returnDate = today();
      borrowing.status = "returned";
      await borrowing.save({ transaction });
      const book = borrowing.book;
      if (book) {
        book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);
        book.status = book.availableCopies > 0 ? "available" : "unavailable";
        await book.save({ transaction });
      }
      await transaction.commit();
      req.flash("success_msg", "Book returned successfully.");
    } catch (err) {
      await transaction.rollback();
      req.flash("error_msg", "Failed to return book.");
    }
    return res.redirect(redirect);
  },

  returnItem: async (req, res) => {
    if (!req.session.userId) return res.redirect("/login");
    const user = await User.findByPk(req.session.userId);
    const isStaff = user && (user.role === "admin" || user.role === "staff");
    const redirect = isStaff ? "/admin/borrowings" : "/borrowings";
    return borrowing.completeReturn(req, res, redirect, isStaff ? null : req.session.userId);
  },

  // Public ledger action: no session lookup, so it works even with member auth
  // enabled elsewhere in the borrow portal.
  adminReturnItem: async (req, res) =>
    borrowing.completeReturn(req, res, "/admin/borrowings"),

  // Show every borrowing record currently in the shared database. Records are
  // split into the borrowed-books ledger and pending/closed request history so
  // nothing is hidden while review stays on the central admin console.
  manage: async (req, res) => {
    const records = await Borrowing.findAll({
      include: [{ model: Book, as: "book" }, { model: User, as: "user" }],
      order: [["createdAt", "DESC"]]
    });
    const borrowings = records.map((record) => {
      const row = record.get({ plain: true });
      const status = normalizeBorrowingStatus(row.status);
      return {
        ...row,
        status,
        statusLabel: statusLabel(status),
        isReturnable: isActiveStatus(status),
        isReview: isReviewStatus(status),
        book: row.book || null,
        user: row.user || null
      };
    });
    res.render("manage-borrowings", {
      title: "Borrowing Records",
      borrowings,
      borrowedBooks: borrowings.filter((row) => !row.isReview && row.status !== "rejected" && row.status !== "cancelled"),
      requestHistory: borrowings.filter((row) => row.isReview || row.status === "rejected" || row.status === "cancelled")
    });
  },

  approve: async (req, res) => {
    const borrowing = await Borrowing.findByPk(req.params.id, { include: [{ model: Book, as: "book" }] });
    if (!borrowing) {
      req.flash("error_msg", "Borrowing record not found.");
      return res.redirect("/admin/borrowings");
    }
    if (!isReviewStatus(borrowing.status)) {
      req.flash("error_msg", "Only pending requests can be approved.");
      return res.redirect("/admin/borrowings");
    }
    const book = borrowing.book;
    if (!book || book.availableCopies <= 0) {
      req.flash("error_msg", "Book is unavailable and cannot be approved.");
      return res.redirect("/admin/borrowings");
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
    if (!isReviewStatus(borrowing.status)) {
      req.flash("error_msg", "Only pending requests can be rejected.");
      return res.redirect("/admin/borrowings");
    }
    borrowing.status = "rejected";
    await borrowing.save();
    req.flash("success_msg", "Borrowing request rejected.");
    res.redirect("/admin/borrowings");
  }
};
