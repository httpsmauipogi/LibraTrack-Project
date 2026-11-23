import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Book } from "./bookModel.js";

export const Loan = sequelize.define("Loan", {
  dueDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM("borrowed", "returned"), allowNull: false, defaultValue: "borrowed" },
  returnedAt: { type: DataTypes.DATEONLY, allowNull: true }
});

User.hasMany(Loan, { foreignKey: { allowNull: false }, onDelete: "CASCADE" });
Loan.belongsTo(User, { foreignKey: { allowNull: false } });
Book.hasMany(Loan, { foreignKey: { allowNull: false }, onDelete: "RESTRICT" });
Loan.belongsTo(Book, { foreignKey: { allowNull: false } });
