
  /*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import express from "express";
import {
  homePage,
  loginPage,
  registerPage,
  handleLogin,
  handleRegister,
  logout,
  dashboardPage,
  adminPage,
  portalLogin,
  adminRequestsPage,
  approveAdminRequest,
  rejectAdminRequest,
  getBooks,
  getMemberHolds,
  getMemberLoans,
  getMemberRequests,
  createMemberRequest,
  cancelMemberRequest,
  createMemberHold,
  deleteMemberHold
} from "../controllers/homeController.js";

const router = express.Router();

router.get("/", homePage);
router.get("/login", loginPage);
router.post("/login", handleLogin);
router.get("/logout", logout);
router.get("/register", registerPage);
router.post("/register", handleRegister);
router.get("/dashboard", dashboardPage);
// Borrow Review is permanently public. No admin session is required to view
// requests or approve/reject them.
router.get("/admin", adminPage);
router.get("/admin/requests", adminRequestsPage);
router.post("/admin/requests/:id/approve", approveAdminRequest);
router.post("/admin/requests/:id/reject", rejectAdminRequest);
router.get("/admin/portal/:portal", portalLogin);

router.get("/api/books", getBooks);
router.get("/api/member/holds", getMemberHolds);
router.get("/api/member/loans", getMemberLoans);
router.get("/api/member/requests", getMemberRequests);
router.post("/api/member/requests", createMemberRequest);
router.delete("/api/member/requests/:id", cancelMemberRequest);
router.post("/api/member/holds", createMemberHold);
router.delete("/api/member/holds/:holdId", deleteMemberHold);

export default router;
