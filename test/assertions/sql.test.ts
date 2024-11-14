/* eslint-disable jest/no-commented-out-tests */
import { handleIsSql } from '../../src/assertions/sql';
import type { Assertion, AssertionParams, GradingResult } from '../../src/types';

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

    /**
     * Catches an incorrect output from node-sql-parser package
     * The parser cannot identify the syntax error: missing comma between column names
     */
    // it('should fail when the output string is an invalid SQL statement', () => {
    //   const renderedValue = undefined;
    //   const outputString = 'SELECT first_name last_name FROM employees';
    //   const result = testFunction(renderedValue, outputString, false);
    //   expect(result.pass).toBe(false);
    //   expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
    // });

    /**
     * Catches an incorrect output from node-sql-parser package
     * The parser cannot identify the syntax error: misuse of backticks (`)
     */
    // it('should fail when the output string is an invalid SQL statement', () => {
    //   const renderedValue = undefined;
    //   const outputString = 'SELECT * FROM `employees`';
    //   const result = testFunction(renderedValue, outputString, false);
    //   expect(result.pass).toBe(false);
    //   expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
    // });
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

    /**
     * Catches an incorrect output from node-sql-parser package
     * The parser cannot differentiate certain syntax between MySQL and PostgreSQL
     */
    // it('should fail if the output SQL statement conforms to PostgreSQL but not MySQL', () => {
    //   const renderedValue = {
    //     databaseType: 'MySQL',
    //   };
    //   const outputString = `SELECT generate_series(1, 10);`;
    //   const result = testFunction(renderedValue, outputString, false);
    //   expect(result.pass).toBe(false);
    //   expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
    // });
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
        reason: `SQL validation failed: authority = 'select::null::employees' is required in table whiteList to execute SQL = 'SELECT * FROM employees'.`,
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
        reason: `SQL validation failed: authority = 'select::null::id' is required in column whiteList to execute SQL = 'SELECT id FROM t'.`,
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

    /**
     * Catches an incorrect output from node-sql-parser package
     * Error message: message: "authority = 'update::null::id' is required in column whiteList to execute SQL = 'UPDATE a SET id = 1'"
     * issue: In this test case, the 'whiteListCheck' function in node-sql-parser requires an explicit 'update::null::id'
     * in the whitelist to allow SQL statement like `UPDATE a SET id = 1`, despite the presence
     * of rule `update::a::id`
     */
    // it('should pass if the output SQL statement does not violate allowedColumns', () => {
    //   const renderedValue = {
    //     databaseType: 'MySQL',
    //     allowedColumns: ['update::a::id'],
    //   };
    //   const outputString = `UPDATE a SET id = 1`;
    //   const result = testFunction(renderedValue, outputString, false);
    //   expect(result.pass).toBe(true);
    //   expect(result.reason).toBe('Assertion passed');
    // });

    /**
     * Similar issue: the error message is Error: authority = 'select::null::id' is required
     * in column whiteList to execute SQL = 'UPDATE employee SET salary = 50000 WHERE id = 1'
     */
    // it('should pass if the output SQL statement does not violate allowedColumns', () => {
    //   const renderedValue = {
    //     databaseType: 'MySQL',
    //     allowedColumns: ['update::employee::salary','select::employee::id'],
    //   };
    //   const outputString = `UPDATE employee SET salary = 50000 WHERE id = 1`;
    //   const result = testFunction(renderedValue, outputString, false);
    //   expect(result.pass).toBe(true);
    //   expect(result.reason).toBe('Assertion passed');
    // });
  });

  /* eslint-enable jest/no-commented-out-tests */
});
