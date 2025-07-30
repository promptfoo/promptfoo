import { runDbMigrations } from '../src/migrate';

runDbMigrations()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
