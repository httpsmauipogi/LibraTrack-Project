import { User } from "../models/userModel.js";
import { publicAdmin } from "../../shared/public-admin.js";

// Catalog Admin has no sign-in. The first shared admin account is used only as
// a display name; a neutral identity is shown if the database is unavailable.
const displayAdmin = async () => {
  try {
    const admin = await User.findOne({
      where: { role: "admin" },
      attributes: ["id", "name", "email", "role"],
      order: [["id", "ASC"]]
    });
    return admin ? admin.get({ plain: true }) : publicAdmin();
  } catch {
    return publicAdmin();
  }
};

export const dashboardPage = async (req, res) => {
  const admin = await displayAdmin();
  res.locals.currentUser = admin;

  const initials = String(admin.name || "Admin User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  res.render("dashboard", {
    title: "Admin Dashboard",
    adminUser: admin,
    adminInitials: initials
  });
};
