import express from "express";
import { homePage } from "../controllers/homeController.js";
import { book } from "../controllers/book.js";
import { borrowing } from "../controllers/borrowing.js";
import { loginPage, registerPage, forgotPasswordPage, dashboardPage, loginUser, registerUser, logoutUser } from "../controllers/authController.js";
import { requireAuth, requireRole, attachUser } from "../middleware/auth.js";
const router = express.Router();

router.use(attachUser);

router.get("/", homePage);

router.get("/login", loginPage);
router.post("/login", loginUser);
router.get("/register", registerPage);
router.post("/register", registerUser);
router.get("/forgot-password", forgotPasswordPage);
router.get("/dashboard", requireAuth, dashboardPage);
router.get("/logout", logoutUser);

// Library catalog
router.get("/books", book.index);
router.get("/books/:id", book.show);
router.post("/books/:id/borrow", requireAuth, book.borrow);

// My borrowings
router.get("/borrowings", requireAuth, borrowing.myBorrowings);
router.post("/borrowings/:id/return", requireAuth, borrowing.returnItem);

// Admin: borrowings management
router.get("/admin/borrowings", requireAuth, requireRole("admin", "staff"), borrowing.manage);
router.post("/admin/borrowings/:id/approve", requireAuth, requireRole("admin", "staff"), borrowing.approve);
router.post("/admin/borrowings/:id/reject", requireAuth, requireRole("admin", "staff"), borrowing.reject);

// Admin: book management
router.get("/admin/books", requireAuth, requireRole("admin", "staff"), book.manage);
router.get("/admin/books/create", requireAuth, requireRole("admin", "staff"), book.createForm);
router.post("/admin/books", requireAuth, requireRole("admin", "staff"), book.create);
router.get("/admin/books/:id/edit", requireAuth, requireRole("admin", "staff"), book.editForm);
router.post("/admin/books/:id", requireAuth, requireRole("admin", "staff"), book.update);
router.post("/admin/books/:id/delete", requireAuth, requireRole("admin", "staff"), book.remove);
router.post("/admin/books/:id/toggle", requireAuth, requireRole("admin", "staff"), book.toggle);

export default router;