import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const User = sequelize.define("User", {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  libraryCard: { type: DataTypes.STRING },
  role: { type: DataTypes.ENUM("admin", "staff", "member"), allowNull: false, defaultValue: "member" }
});

export { sequelize };