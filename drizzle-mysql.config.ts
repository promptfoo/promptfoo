import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/database/mysql-tables.ts',
  out: './drizzle-mysql',
  dbCredentials: {
    host: process.env.PROMPTFOO_MYSQL_HOST || 'localhost',
    port: parseInt(process.env.PROMPTFOO_MYSQL_PORT || '3306'),
    user: process.env.PROMPTFOO_MYSQL_USER || 'root',
    password: process.env.PROMPTFOO_MYSQL_PASSWORD || 'root',
    database: process.env.PROMPTFOO_MYSQL_DATABASE || 'promptfoo',
  },
});