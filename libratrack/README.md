# LibraTrack

Library portal built with Express, Sequelize, hbs (`.xian` views) and Tailwind CSS.

## Run

```bash
cd libratrack
npm install
npm start          # http://localhost:3000
```

No database setup is required. On first run the app creates a persistent SQLite
database at `data/libratrack.db` (ignored by git) and synchronizes the tables.

Useful scripts:

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload |
| `npm test` | Run the route tests |
| `npm run migrate` | Create/upgrade the configured database |
| `npm run route:list` | List registered routes |

## Database configuration

SQLite is the default. To use MySQL instead, set the environment variables before
starting the app:

```bash
DB_DIALECT=mysql DB_HOST=localhost DB_PORT=3306 \
DB_USER=root DB_PASSWORD=secret DB_NAME=LibraTrack \
npm start
```

If the MySQL database does not exist yet, it is created automatically. Other
optional variables: `DB_DIALECT=sqlite` with `DB_STORAGE=/path/to/file.db` to
relocate the SQLite file, and `DB_CONNECT_TIMEOUT` (milliseconds) for MySQL.

When a configured database is unreachable, the app still starts with in-memory
demo data; changes made in that mode are not saved between restarts.

## Demo account

| Email | Password |
|-------|----------|
| member.one@libra.local | password123 |

## Admin access

`/admin` is restricted to accounts whose role is `admin`. Public registration
always creates `member` accounts, so an admin account has to be created
deliberately in the database. Password hashes are never shown on the admin page.
