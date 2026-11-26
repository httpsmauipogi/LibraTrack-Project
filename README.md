# LibraTrack system

Three connected portals sharing one administrator account:

| App | Directory | Default URL | Admin can |
|-----|-----------|-------------|-----------|
| Member portal | `libratrack/` | http://localhost:3000 | View the admin console and accounts |
| Library catalog | `catalog/` | http://localhost:3001 (3000 fallback) | Add/edit/delete books, process returns |
| Borrow & return | `betlog/` | http://localhost:3002 | Show every borrowing record, process returns, manage books |

All three apps now read and write **one shared SQLite database** at
`data/shared.db` (override with `DB_STORAGE`). Accounts, books, and borrow logs
are the same records everywhere. Catalog Admin is the source of truth for books.
Borrow requests submitted from the member dashboard are reviewed on the central
admin console; approved requests become borrowed-book records in the borrow
portal.

From http://localhost:3000/admin:

- **Catalog Admin** links directly to http://localhost:3001/dashboard.
- **Borrow Review** opens the dedicated review page at
  http://localhost:3000/admin/requests.
- **Borrowed Books** links directly to http://localhost:3002/admin/borrowings.

Catalog Admin, Borrow Review, and Borrowed Books are permanently public. Their
routes, review actions, and pages have no sign-in gate, no SSO requirement, and
no sign-in/sign-out controls. Catalog's old `/login`, `/sso/login`, and `/logout`
routes have been removed entirely.

`AUTH_REQUIRED=true` still enforces accounts in the remaining member areas of
the borrow portal; it does not affect the three public admin destinations.

## Shared data

There are no default/seed books. Books added in Catalog Admin are written to
the shared `books` table, so the member portal and Borrowing Management see
them immediately. Borrow requests submitted in the member dashboard are written
to the shared `borrowings` table with `pending` status. The central admin reviews
those requests; approved ones become `active`. Catalog Admin counts only active
records as loans, while http://localhost:3002/admin/borrowings lists every
record currently in the database, grouped as borrowed books and request history.

Existing app databases are merged into `data/shared.db` by:

```bash
npm run db:share
```

## Shared administrator

```
email:    library.admin@gmail.com
password: the password configured with `npm run admin:sync`
```

To create or change the shared administrator (updates the one shared database
and demotes any other admin accounts):

```bash
ADMIN_EMAIL='library.admin@gmail.com' \
ADMIN_PASSWORD='your-password' \
ADMIN_NAME='Admin User' \
npm run admin:sync
```

Passwords are stored as bcrypt hashes, never in source code.

## Shared design

All three portals render from one canonical theme in `shared/views/partials/`
(`head`, `navbar`, `footer`) plus shared Handlebars helpers in
`shared/hbs-helpers.js`. Colors (deep indigo `#1e1b4b`, indigo accent, slate
text), the Inter typeface, cards, buttons, and the dark header are identical
everywhere. To restyle the whole system, edit those three partials once.

## Run and test

```bash
npm --prefix libratrack start
npm --prefix catalog start
npm --prefix betlog start

npm run test:all
```

Run each app from the repository root or from its own directory — database and
static file paths are resolved from the repository, not the current directory.
