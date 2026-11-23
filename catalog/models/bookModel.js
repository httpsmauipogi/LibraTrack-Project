import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Book = sequelize.define("Book", {
  title: { type: DataTypes.STRING, allowNull: false },
  author: { type: DataTypes.STRING, allowNull: false },
  isbn: { type: DataTypes.STRING, allowNull: false, unique: true },
  category: { type: DataTypes.STRING, allowNull: false },
  shelf: { type: DataTypes.STRING, allowNull: false },
  totalCopies: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
  availableCopies: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 0 } },
  borrowCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
});
