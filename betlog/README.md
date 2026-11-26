# LibraTrack — Library Borrow & Return Web System

XianFire Framework project built with Express, Sequelize, SQLite (MySQL optional), and Tailwind CSS. A web system for borrowing and returning books with role-based access (Admin, Staff, Member).

## Features

- User authentication (login/register/logout) with role-based access
- Book catalog with availability tracking
- Borrow request submission (pending → approved → active → returned)
- Admin/Staff borrowing management (approve/reject requests)
- User borrowing history with return functionality
- SQLite database by default (`data/betlog.db`), MySQL via `DB_DIALECT=mysql`
- Default port 3002; the shared LibraTrack admin account works here too

## Tech Stack

- Node.js + Express
- Sequelize ORM (SQLite by default)
- SQLite (no external database server required)
- Handlebars (`.xian` views)
- Tailwind CSS (CDN)
- express-session + connect-flash

## Project Structure

```
betlog/
├── index.js              # Express app entry point
├── package.json          # Dependencies & scripts
├── migrate.js            # Database migration
├── create.js             # Scaffold generator
├── bin/
│   └── xian.js           # CLI binary
├── controllers/
│   ├── item.js           # Item catalog + borrow actions
│   ├── borrowing.js      # Borrow/return/manage/approve/reject
│   ├── authController.js # Login/register/dashboard/logout
│   └── homeController.js # Home page
├── middleware/
│   └── auth.js           # requireAuth, requireRole, attachUser
├── models/
│   ├── db.js             # Sequelize MySQL connection
│   ├── Item.js           # Item model
│   ├── Borrowing.js      # Borrowing model
│   └── userModel.js      # User model
├── public/
│   └── tailwind.css
├── routes/
│   └── index.js          # All routes
└── views/
    ├── home.xian
    ├── login.xian
    ├── register.xian
    ├── forgotpassword.xian
    ├── dashboard.xian
    ├── items.xian
    ├── item.xian
    ├── borrowings.xian
    ├── manage-borrowings.xian
    └── partials/
        ├── head.xian
        └── footer.xian
```

## Installation

### Prerequisites
- Node.js (v18+)
- MySQL (e.g., Laragon)
- npm

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd betlog
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure the database**
- Start MySQL (e.g., Laragon)
- Create a database named `betlog`
- Update `models/db.js` if your MySQL credentials differ:
  ```js
  export const sequelize = new Sequelize("betlog", "root", "", {
    host: "localhost",
    port: 3306,
    dialect: "mysql"
  });
  ```

4. **Run the server**
   ```bash
   npm start
   # or
   npm run dev
   ```

5. **Open the application**
   ```
   http://localhost:3000
   ```

## Test Accounts

Seed the database first (run `seed.mjs` or manually insert), then log in:

| Role | Email | Password |
|------|-------|----------|
| Admin | malabhajayar@gmail.com | admin123 |
| Staff | staff@betlog.edu | staff123 |
| Member | member@betlog.edu | member123 |

## Routes

| Route | Method | Description | Access |
|-------|--------|-------------|--------|
| `/` | GET | Home page | Public |
| `/login` | GET/POST | Login | Public |
| `/register` | GET/POST | Register | Public |
| `/dashboard` | GET | User dashboard | Auth |
| `/logout` | GET | Logout | Auth |
| `/books` | GET | Library catalog | Public |
| `/books/:id` | GET | Book detail | Public |
| `/books/:id/borrow` | POST | Submit borrow request | Auth |
| `/borrowings` | GET | My borrowings | Auth |
| `/borrowings/:id/return` | POST | Return a book | Auth (owner) |
| `/admin/borrowings` | GET | Manage all borrowings | Admin/Staff |
| `/admin/borrowings/:id/approve` | POST | Approve request | Admin/Staff |
| `/admin/borrowings/:id/reject` | POST | Reject request | Admin/Staff |

## Borrowing Flow

1. Member browses `/books` and clicks **Borrow** on an available book
2. Request is created with status `pending`
3. Admin/Staff reviews at `/admin/borrowings` and clicks **Approve** or **Reject**
4. Approved requests become `active` with a 7-day due date; book copies decrease
5. Member returns the book at `/borrowings` → status becomes `returned`; copies restored

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the production server |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm run migrate` | Run database migration |
| `npm run route:list` | List all registered routes |

## License

MIT License — Copyright (c) 2025 Christian I. Cabrera || XianFire Framework, Mindoro State University - Philippines
