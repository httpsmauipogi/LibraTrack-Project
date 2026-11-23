import bcrypt from "bcrypt";
import inquirer from "inquirer";
import { User, sequelize } from "./models/userModel.js";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

try {
  await sequelize.authenticate();
  console.log("Connected to the configured LibraTrack database.");

  const { email: rawEmail } = await inquirer.prompt([
    {
      type: "input",
      name: "email",
      message: "Admin account email:",
      validate: (value) => isValidEmail(value.trim()) || "Enter a valid email address."
    }
  ]);
  const email = rawEmail.trim().toLowerCase();
  const admin = await User.findOne({ where: { email, role: "admin" } });

  if (!admin) {
    throw new Error("No admin account matches that email in the configured database.");
  }

  const { password, confirmPassword } = await inquirer.prompt([
    {
      type: "password",
      name: "password",
      message: "New admin password (minimum 12 characters):",
      mask: "*",
      validate: (value) => value.length >= 12 || "Use at least 12 characters."
    },
    {
      type: "password",
      name: "confirmPassword",
      message: "Confirm new admin password:",
      mask: "*",
      validate: (value, answers) => value === answers.password || "Passwords do not match."
    }
  ]);

  admin.password = await bcrypt.hash(password, 12);
  await admin.save();
  console.log(`Admin password updated for ${email}.`);
} catch (error) {
  console.error("Could not reset admin password:", error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
