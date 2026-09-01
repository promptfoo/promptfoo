# Database Migrations

**What this is:** Drizzle ORM migration files for SQLite database. Auto-generated SQL that applies schema changes.

## Schema is NOT Here

**Schema definitions are in `src/database/tables.ts`, NOT in this directory.**

This directory only contains generated SQL migration files.

## Migration Workflow

1. **Modify schema** in `src/database/tables.ts`
2. **Generate migration:** `npm run db:generate`
3. **Review SQL** in new `drizzle/NNNN_name.sql` file
4. **Apply migration:** `npm run db:migrate`

## File Naming

Drizzle auto-generates names: `NNNN_adjective_noun.sql`

- `0000_lush_hellion.sql`
- `0001_wide_calypso.sql`
- Sequential numbering ensures order

## Key Commands

```bash
npm run db:generate  # Generate migration from schema changes
npm run db:migrate   # Apply pending migrations
npm run db:studio    # Open GUI at localhost:4983
```

## Database Location

Default: `~/.promptfoo/promptfoo.db` (SQLite file)

Override the config directory with `PROMPTFOO_CONFIG_DIR`; the database file is `promptfoo.db` inside that directory.

**NEVER delete the database.** You may read from it but deletion destroys user data.

## SQLite Limitations

**Cannot drop columns** - SQLite doesn't support `ALTER TABLE DROP COLUMN`.

Workaround: Create new table, copy data, drop old table, rename new table.

**Cannot rename columns** (older SQLite) - Same workaround as drop column.

## Migration Best Practices

1. **Always review generated SQL** before applying
2. **Never edit applied migrations** - create new migration instead
3. **Backup before major changes:** `sqlite3 ~/.promptfoo/promptfoo.db ".backup backup.db"`
4. **Test schema changes with isolated storage**: unit tests should use the shared in-memory DB; CLI, resume, WAL, and path-behavior tests may use an isolated `PROMPTFOO_CONFIG_DIR`

## What's Stored

- Evaluation results and test configurations
- Execution traces for debugging
- Analytics data and telemetry
- User settings and preferences

## Tech Stack

- **Drizzle ORM** - Type-safe schema and migrations
- **@libsql/client** - Async SQLite/libSQL driver. `getDb()` returns a Promise (`src/database/index.ts`), so always `await getDb()` before database work.
- **SQLite / libSQL** - Embedded database
