// One set of Sequelize models for all three portals. Every app passes its own
// Sequelize instance, so they all read and write the same tables.
import { BORROWING_STATUSES, normalizeBorrowingStatus } from "./borrowing-status.js";

export const defineSharedModels = ({ sequelize, DataTypes }) => {
  const common = { timestamps: true, underscored: true };
  const roles = ["admin", "staff", "member", "visitors"];

  const User = sequelize.define("User", {
    memberId: { type: DataTypes.STRING, allowNull: true, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    libraryCard: { type: DataTypes.STRING, allowNull: true },
    role: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "member",
      validate: { isIn: [roles] }
    }
  }, { tableName: "users", ...common });

  const Book = sequelize.define("Book", {
    title: { type: DataTypes.STRING, allowNull: false },
    author: { type: DataTypes.STRING, allowNull: false },
    isbn: { type: DataTypes.STRING, allowNull: false, unique: true },
    category: { type: DataTypes.STRING, allowNull: false },
    shelf: { type: DataTypes.STRING, allowNull: false },
    totalCopies: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1 }
    },
    availableCopies: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 0 }
    },
    borrowCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "available",
      validate: { isIn: [["available", "unavailable"]] }
    },

    // BetLog compatibility aliases. Catalog remains the source of truth for
    // these fields; the aliases let the borrow portal render the same record.
    genre: {
      type: DataTypes.VIRTUAL,
      get() { return this.category; },
      set(value) {
        if (value !== undefined && value !== null) this.setDataValue("category", String(value));
      }
    },
    copies: {
      type: DataTypes.VIRTUAL,
      get() { return this.totalCopies; },
      set(value) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) this.setDataValue("totalCopies", parsed);
      }
    },
    available: {
      type: DataTypes.VIRTUAL,
      get() { return this.availableCopies; },
      set(value) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) this.setDataValue("availableCopies", parsed);
      }
    }
  }, { tableName: "books", ...common });

  const Borrowing = sequelize.define("Borrowing", {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    bookId: { type: DataTypes.INTEGER, allowNull: false },
    borrowDate: { type: DataTypes.DATEONLY, allowNull: true },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    returnDate: { type: DataTypes.DATEONLY, allowNull: true },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
      validate: { isIn: [BORROWING_STATUSES] }
    },
    notes: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: "borrowings",
    ...common,
    hooks: {
      beforeValidate: (record) => {
        if (record.changed("status")) {
          record.status = normalizeBorrowingStatus(record.status);
        }
      }
    }
  });

  Borrowing.belongsTo(User, { foreignKey: "userId", as: "user" });
  Borrowing.belongsTo(Book, { foreignKey: "bookId", as: "book" });

  return { User, Book, Borrowing };
};
