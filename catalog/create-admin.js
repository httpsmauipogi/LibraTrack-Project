import bcrypt from "bcrypt";
import inquirer from "inquirer";
import { User, sequelize } from "./models/userModel.js";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

try {
  await sequelize.sync();
  await sequelize.authenticate();
  console.log("Connected to the LibraTrack database.");

  const { email: rawEmail } = await inquirer.prompt([
    {
      type: "input",
      name: "email",
      message: "Admin email:",
      validate: (value) => isValidEmail(value.trim()) || "Enter a valid email address."
    }
  ]);
  const email = rawEmail.trim().toLowerCase();
  const existingUser = await User.findOne({ where: { email } });

  if (existingUser) {
    const { promote } = await inquirer.prompt([
      {
        type: "confirm",
        name: "promote",
        message: `Promote the existing account ${email} to admin?`,
        default: false
      }
    ]);

    if (!promote) {
      console.log("No changes made.");
      process.exitCode = 0;
    } else {
      existingUser.role = "admin";
      await existingUser.save();
      console.log(`Admin access enabled for ${email}.`);
    }
  } else {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Admin name:",
        validate: (value) => value.trim().length > 0 || "Name is required."
      },
      {
        type: "password",
        name: "password",
        message: "Admin password (minimum 12 characters):",
        mask: "*",
        validate: (value) => value.length >= 12 || "Use at least 12 characters."
      },
      {
        type: "password",
        name: "confirmPassword",
        message: "Confirm admin password:",
        mask: "*",
        validate: (value, answers) => value === answers.password || "Passwords do not match."
      }
    ]);

    const password = await bcrypt.hash(answers.password, 12);
    await User.create({
      name: answers.name.trim(),
      email,
      password,
      role: "admin"
    });
    console.log(`Admin account created for ${email}.`);
  }
} catch (error) {
  console.error("Could not configure admin account:", error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
