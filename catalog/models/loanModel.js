// Catalog's old Loan table is now the shared borrowings table.
export { Borrowing as Loan, sequelize } from "./index.js";
