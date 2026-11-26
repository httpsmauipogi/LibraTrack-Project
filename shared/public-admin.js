// The three admin destinations are intentionally unauthenticated. Views still
// need a display name, so they use this neutral identity instead of a session.
export const publicAdmin = () => ({
  id: 0,
  memberId: "PUBLIC-ADMIN",
  name: process.env.ADMIN_NAME || "Admin User",
  email: process.env.ADMIN_EMAIL || "library.admin@gmail.com",
  role: "admin"
});
