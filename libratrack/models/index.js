import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { defineSharedModels } from "../../shared/models.js";

export const { User, Book, Borrowing } = defineSharedModels({ sequelize, DataTypes });
export { sequelize };
