import { sequelize, connectDatabase } from "./models/db.js";
import "./models/userModel.js";

try {
  await connectDatabase();
  console.log("✅ Tables created/updated for all models!");
} catch (error) {
  console.error("❌ Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
