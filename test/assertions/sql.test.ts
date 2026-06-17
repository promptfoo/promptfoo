import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleContainsSql, handleIsSql } from '../../src/assertions/sql';

import type { Assertion, AssertionParams, GradingResult } from '../../src/types/index';

const assertion: Assertion = {
  type: 'is-sql',
};

describe('is-sql assertion', () => {
  // -------------------------------------------------- Basic Tests ------------------------------------------------------ //
  describe('Basic tests', () => {
    it('should pass when the output string is a valid SQL statement', async () => {
      const renderedValue = undefined;
      const outputString = 'SELECT id, name FROM users';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        assertion,
        pass: true,
        reason: 'Assertion passed',
        score: 1,
      });
    });

    it.each([
      'SELECT DISTINCT name FROM users',
      'select distinct id from users',
      'SELECT SQL_NO_CACHE name FROM users',
      'SELECT DISTINCT SQL_NO_CACHE name FROM users',
    ])('should pass valid SELECT modifiers: %s', async (outputString) => {
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue: undefined,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        assertion,
        pass: true,
        reason: 'Assertion passed',
        score: 1,
      });
    });

    it('should pass a quoted column after DISTINCT', async () => {
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue: { databaseType: 'PostgreSQL' },
        outputString: 'SELECT DISTINCT "display name" FROM users',
        inverse: false,
      } as AssertionParams);
      expect(result.pass).toBe(true);
    });

    it.each([
      {
        outputString: "SELECT 'select distinct first_name last_name from employees' AS sample",
        renderedValue: undefined,
      },
      {
        outputString: 'SELECT 1 /* select distinct first_name last_name from employees */',
        renderedValue: undefined,
      },
      {
        outputString: 'SELECT 1 -- select distinct first_name last_name from employees\n',
        renderedValue: undefined,
      },
      {
        outputString: 'SELECT "select distinct first_name last_name from employees" AS sample',
        renderedValue: { databaseType: 'PostgreSQL' },
      },
      {
        outputString: 'SELECT $$select distinct first_name last_name from employees$$ AS sample',
        renderedValue: { databaseType: 'PostgreSQL' },
      },
    ])('should ignore SQL-like text in literals and comments: $outputString', async ({
      outputString,
      renderedValue,
    }) => {
      const result = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toMatchObject({ pass: true, score: 1 });
    });

    it.each([
      'SELECT a b FROM t',
      'SELECT DISTINCT first_name last_name FROM employees',
      'SELECT SQL_NO_CACHE first_name last_name FROM employees',
      'SELECT DISTINCTIVE name FROM users',
    ])('should fail a likely missing comma between columns: %s', async (outputString) => {
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue: undefined,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toMatchObject({
        pass: false,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        score: 0,
      });
    });

    it.each(['', '   '])('should fail empty SQL: %j', async (outputString) => {
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue: undefined,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toMatchObject({
        pass: false,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        score: 0,
      });
    });

    it('should validate SQL extracted from a fenced response', async () => {
      const containsSqlAssertion: Assertion = { type: 'contains-sql' };
      const result = await handleContainsSql({
        assertion: containsSqlAssertion,
        renderedValue: undefined,
        outputString: 'Result:\n```sql\nSELECT DISTINCT name FROM users\n```',
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        assertion: containsSqlAssertion,
        pass: true,
        reason: 'Assertion passed',
        score: 1,
      });
    });

    it('should fail a likely missing comma inside a fenced response', async () => {
      const containsSqlAssertion: Assertion = { type: 'contains-sql' };
      const result = await handleContainsSql({
        assertion: containsSqlAssertion,
        renderedValue: undefined,
        outputString:
          'Here you go:\n```sql\nSELECT DISTINCT first_name last_name FROM employees\n```',
        inverse: false,
      } as AssertionParams);
      expect(result).toMatchObject({
        pass: false,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        score: 0,
      });
    });

    it('should fail when the SQL statement contains a syntax error in the ORDER BY clause', async () => {
      const renderedValue = undefined;
      const outputString = 'SELECT * FROM orders ORDERY BY order_date';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        assertion,
      });
    });

    it('should fail when the SQL statement uses a reserved keyword as a table name', async () => {
      const renderedValue = undefined;
      const outputString = 'SELECT * FROM select WHERE id = 1';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        assertion,
      });
    });

    it('should fail when the SQL statement has an incorrect DELETE syntax', async () => {
      const renderedValue = undefined;
      const outputString = 'DELETE employees WHERE id = 1';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        assertion,
      });
    });

    it('should fail when the SQL statement is missing a comma between columns', async () => {
      const renderedValue = undefined;
      const outputString = 'SELECT first_name last_name FROM employees';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        assertion,
      });
    });

    it('should fail when the SQL statement contains mismatched backticks', async () => {
      const renderedValue = undefined;
      const outputString = 'SELECT * FROM `employees';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toMatchObject({
        pass: false,
        score: 0,
        assertion,
      });
      expect(result.reason).toContain(
        'SQL statement does not conform to the provided MySQL database syntax.',
      );
    });

    it('should pass when the SQL statement contains properly matched backticks', async () => {
      const renderedValue = undefined;
      const outputString = 'SELECT * FROM `employees` WHERE `id` = 1';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should fail when the SQL statement contains multiple mismatched backticks', async () => {
      const renderedValue = undefined;
      const outputString = 'SELECT `id, `name FROM `users';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toMatchObject({
        pass: false,
        score: 0,
      });
    });

    it('should fail when SELECT has invalid column list format', async () => {
      const renderedValue = undefined;
      const outputString = 'SELECT col1 col2 col3 FROM table1';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toMatchObject({
        pass: false,
        score: 0,
      });
    });
  });

  // ------------------------------------------ Database Specific Syntax Tests ------------------------------------------- //
  describe('Database Specific Syntax Tests', () => {
    it('should fail if the output SQL statement conforms to MySQL but not PostgreSQL', async () => {
      const renderedValue = {
        databaseType: 'PostgreSQL',
      };
      const outputString = `SELECT * FROM employees WHERE id = 1 LOCK IN SHARE MODE`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'SQL statement does not conform to the provided PostgreSQL database syntax.',
        assertion,
      });
    });

    it('should fail if the output SQL statement conforms to PostgreSQL but not MySQL', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
      };
      const outputString = `SELECT first_name, last_name FROM employees WHERE first_name ILIKE 'john%'`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        assertion,
      });
    });

    it('should pass if the output SQL statement conforms to PostgreSQL but not MySQL', async () => {
      const renderedValue = {
        databaseType: 'PostgreSQL',
      };
      const outputString = `SELECT first_name, last_name FROM employees WHERE first_name ILIKE 'john%'`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should fail if the output SQL statement uses PostgreSQL-only syntax on MySQL', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
      };
      const outputString = 'SELECT generate_series(1, 10);';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        assertion,
      });
    });

    it('should fail when using generate_series in MySQL even with valid syntax', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
      };
      const outputString = 'SELECT * FROM table_name WHERE id IN (SELECT generate_series(1, 5));';
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
        assertion,
      });
    });
  });

  // ------------------------------------------- White Table/Column List Tests ------------------------------------------- //
  describe('White Table/Column List Tests', () => {
    it('should fail if the output SQL statement violate allowedTables', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedTables: ['(select|update|insert|delete)::null::departments'],
      };
      const outputString = `SELECT * FROM employees`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: `SQL references unauthorized table(s). Found: [select::null::employees]. Allowed: [(select|update|insert|delete)::null::departments].`,
        assertion,
      });
    });

    it('should pass if the output SQL statement does not violate allowedTables', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedTables: ['(select|update|insert|delete)::null::departments'],
      };
      const outputString = `SELECT * FROM departments`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should fail if the output SQL statement violate allowedColumns', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedColumns: ['select::null::name', 'update::null::id'],
      };
      const outputString = `SELECT id FROM t`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: `SQL references unauthorized column(s). Found: [select::null::id]. Allowed: [select::null::name, update::null::id].`,
        assertion,
      });
    });

    it('should pass if the output SQL statement does not violate allowedColumns', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedColumns: ['insert::department::dept_name', 'insert::department::location'],
      };
      const outputString = `INSERT INTO department (dept_name, location) VALUES ('Sales', 'New York')`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should pass when update column whitelist references table name', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedColumns: ['update::a::id'],
      };
      const outputString = `UPDATE a SET id = 1`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should pass when multiple column authorities are provided for update', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedColumns: ['update::employee::salary', 'select::employee::id'],
      };
      const outputString = `UPDATE employee SET salary = 50000 WHERE id = 1`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should pass with normalized whitelist entries', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedColumns: ['select::employees::name'],
      };
      const outputString = `SELECT name FROM employees`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    // Issue #1491: Verify correct behavior when table name differs from expected
    it('should fail when SQL uses wrong table name (issue #1491)', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedTables: ['select::null::data_table'],
      };
      // LLM generated SQL with "data" instead of "data_table"
      const outputString = `SELECT * FROM data WHERE id = 1`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('SQL references unauthorized table(s)');
      expect(result.reason).toContain('select::null::data');
      expect(result.reason).toContain('select::null::data_table');
    });

    it('should pass when SQL correctly uses allowed table name', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedTables: ['select::null::data_table'],
      };
      const outputString = `SELECT * FROM data_table WHERE id = 1`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should handle double-quoted table names in PostgreSQL mode', async () => {
      const renderedValue = {
        databaseType: 'PostgreSQL',
        allowedTables: ['select::null::data_table'],
      };
      const outputString = `SELECT * FROM "data_table" WHERE id = 1`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should fail when double-quoted table name differs from allowed', async () => {
      const renderedValue = {
        databaseType: 'PostgreSQL',
        allowedTables: ['select::null::data_table'],
      };
      // Using "data" instead of "data_table"
      const outputString = `SELECT * FROM "data" WHERE id = 1`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('SQL references unauthorized table(s)');
      expect(result.reason).toContain('select::null::data');
    });

    it('should handle multiple tables with some unauthorized', async () => {
      const renderedValue = {
        databaseType: 'MySQL',
        allowedTables: ['select::null::users'],
      };
      // Query joins with an unauthorized table
      const outputString = `SELECT u.name, p.title FROM users u, posts p WHERE u.id = p.user_id`;
      const result: GradingResult = await handleIsSql({
        assertion,
        renderedValue,
        outputString,
        inverse: false,
      } as AssertionParams);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('SQL references unauthorized table(s)');
      expect(result.reason).toContain('select::null::posts');
    });
  });
});

describe('is-sql parser loading', () => {
  afterEach(() => {
    vi.doUnmock('node-sql-parser');
  });

  it('should report when node-sql-parser cannot be imported', async () => {
    vi.doMock('node-sql-parser', () => {
      throw new Error('module unavailable');
    });

    await expect(
      handleIsSql({
        assertion,
        renderedValue: undefined,
        outputString: 'SELECT 1',
        inverse: false,
      } as AssertionParams),
    ).rejects.toThrow('node-sql-parser is not installed. Please install it first');
  });

  it('should report when node-sql-parser has no Parser export', async () => {
    vi.doMock('node-sql-parser', () => ({ Parser: undefined, default: {} }));

    await expect(
      handleIsSql({
        assertion,
        renderedValue: undefined,
        outputString: 'SELECT 1',
        inverse: false,
      } as AssertionParams),
    ).rejects.toThrow('node-sql-parser is not installed. Please install it first');
  });
});
