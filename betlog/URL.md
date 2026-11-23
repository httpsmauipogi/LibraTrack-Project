# BetLog — Borrowing and Return Web System

**URL:** http://localhost:3000

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@betlog.edu | admin123 |
| Staff | staff@betlog.edu | staff123 |
| Visitor | visitor@betlog.edu | visitor123 |

## Pages

| Page | URL |
|------|-----|
| Home | http://localhost:3000/ |
| Item Catalog | http://localhost:3000/items |
| Item Detail + Borrow | http://localhost:3000/items/:id |
| My Borrowings + Return | http://localhost:3000/borrowings |
| Manage (Admin/Staff) | http://localhost:3000/admin/borrowings |

## Flow

1. Browse items at `/items`
2. Click **Borrow** to submit a request (`pending`)
3. Admin/Staff approves at `/admin/borrowings` (`active`)
4. Return at `/borrowings` (`returned`)

## Run

```bash
npm start
```