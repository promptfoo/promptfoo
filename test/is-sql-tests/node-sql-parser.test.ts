import { Parser } from 'node-sql-parser';

// The isolated is-sql implementation:
const sqlParser = new Parser();

interface SqlParserOption {
  database: string | undefined;
  type?: string; // 'type' is optional
}

const testFunction = (renderedValue: any, outputString: string, inverse: boolean) => {
  let parsedSQL;
  let databaseType: string | undefined = 'MySQL';
  let whiteTableList: string[] | undefined;
  let whiteColumnList: string[] | undefined;
  let pass = false;

  if (renderedValue) {
    if (typeof renderedValue === 'object') {
      const value = renderedValue as {
        database?: string;
        whiteTableList?: string[];
        whiteColumnList?: string[];
      };

      databaseType = value.database || 'MySQL';
      whiteTableList = value.whiteTableList;
      whiteColumnList = value.whiteColumnList;

    } else {
      throw new Error('is-sql assertion must have an object value.')
    }
  }

  let opt: SqlParserOption = { database: databaseType };
  let failed_reason = '';
  try {
    parsedSQL = sqlParser.astify(outputString, opt); // mysql sql grammer parsed by default
    pass = !inverse;
  } catch (err) {
    pass = inverse;
    failed_reason = `SQL statement does not conform to the provided ${databaseType} database syntax.`;
  }

  if (whiteTableList) {
    opt = {
      database: databaseType,
      type: 'table',
    }
    try {
      sqlParser.whiteListCheck(outputString, whiteTableList, opt);
    } catch (err) {
      pass = inverse;
      failed_reason += ' It failed the provided authority table list check.'
    }
  }

  if (whiteColumnList) {
    opt = {
      database: databaseType,
      type: 'column',
    }
    try {
      sqlParser.whiteListCheck(outputString, whiteColumnList, opt);
    } catch (err) {
      pass = inverse;
      failed_reason += ' It failed the provided authority column list check.'
    }
  }
  
  if ( inverse && pass === false && !failed_reason ) {
    failed_reason = 'The output SQL statement is valid';
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : failed_reason,
    assertion: renderedValue,
  };
};

// -------------------------------------------------- Basic Tests ------------------------------------------------------ //
describe('Basic tests', () => {  
  it('should pass when the output string is a valid SQL statement', () => {
    const renderedValue = undefined;
    const outputString = 'SELECT id, name FROM users';
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when the output string is an invalid SQL statement', () => {
    const renderedValue = undefined;
    const outputString = 'SELECT * FROM orders ORDERY BY order_date';
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
  });

  it('should fail when the output string is an invalid SQL statement', () => {
    const renderedValue = undefined;
    const outputString = 'SELECT * FROM select WHERE id = 1';
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
  });

  it('should fail when the output string is an invalid SQL statement', () => {
    const renderedValue = undefined;
    const outputString = 'DELETE employees WHERE id = 1';
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
  });

  /**
   * Catches an incorrect output from node-sql-parser package
   * The paser cannot identify the syntax error: missing comma between column names
   */
  it('should fail when the output string is an invalid SQL statement', () => {
    const renderedValue = undefined;
    const outputString = 'SELECT first_name last_name FROM employees';
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
  });

  /**
   * Catches an incorrect output from node-sql-parser package
   * The paser cannot identify the syntax error: misuse of backticks (`)
   */
  it('should fail when the output string is an invalid SQL statement', () => {
    const renderedValue = undefined;
    const outputString = 'SELECT * FROM `employees`';
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
  });

});

// ------------------------------------------ Database Specific Syntax Tests ------------------------------------------- //
describe('Database Specific Syntax Tests', () => {
  it('should fail if the output SQL statement conforms to MySQL but not PostgreSQL', () => {
    const renderedValue = {
      database: 'PostgreSQL',
    };    
    const outputString = `SELECT * FROM employees WHERE id = 1 LOCK IN SHARE MODE`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('SQL statement does not conform to the provided PostgreSQL database syntax.');
  });  

  it('should fail if the output SQL statement conforms to PostgreSQL but not MySQL', () => {
    const renderedValue = {
      database: 'MySQL',
    };
    const outputString = `SELECT first_name, last_name FROM employees WHERE first_name ILIKE 'john%'`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
  });

  it('should pass if the output SQL statement conforms to PostgreSQL but not MySQL', () => {
    const renderedValue = {
      database: 'PostgreSQL',
    };
    const outputString = `SELECT first_name, last_name FROM employees WHERE first_name ILIKE 'john%'`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Assertion passed');
  });

  /**
   * Catches an incorrect output from node-sql-parser package
   * The paser cannot differentiate certain syntax between MySQL and PostgreSQL
   */
  it('should fail if the output SQL statement conforms to PostgreSQL but not MySQL', () => {
    const renderedValue = {
      database: 'MySQL',
    };
    const outputString = `SELECT generate_series(1, 10);`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('SQL statement does not conform to the provided MySQL database syntax.');
  });

});

// ------------------------------------------- White Table/Column List Tests ------------------------------------------- //
describe('White Table/Column List Tests', () => {
  it('should fail if the output SQL statement violate whiteTableList', () => {
    const renderedValue = {
      database: 'MySQL',
      whiteTableList: ['(select|update|insert|delete)::null::departments'],
    };
    const outputString = `SELECT * FROM employees`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe(' It failed the provided authority table list check.');
  });

  it('should pass if the output SQL statement does not violate whiteTableList', () => {
    const renderedValue = {
      database: 'MySQL',
      whiteTableList: ['(select|update|insert|delete)::null::departments'],
    };
    const outputString = `SELECT * FROM departments`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail if the output SQL statement violate whiteColumnList', () => {
    const renderedValue = {
      database: 'MySQL',
      whiteColumnList: ['select::null::name', 'update::null::id'],
    };
    const outputString = `SELECT id FROM t`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe(' It failed the provided authority column list check.');
  });  

  it('should pass if the output SQL statement does not violate whiteColumnList', () => {
    const renderedValue = {
      database: 'MySQL',
      whiteColumnList: ['insert::department::dept_name', 'insert::department::location'],
    };
    const outputString = `INSERT INTO department (dept_name, location) VALUES ('Sales', 'New York')`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Assertion passed');
  });

  /**
   * Catches an incorrect output from node-sql-parser package
   * Error message: message: "authority = 'update::null::id' is required in column whiteList to execute SQL = 'UPDATE a SET id = 1'"
   * issue: In this test case, the 'whiteListCheck' function in node-sql-parser requires an explicit 'update::null::id'
   * in the whitelist to allow SQL statement like `UPDATE a SET id = 1`, despite the presence
   * of rule `update::a::id`
   */
  it('should pass if the output SQL statement does not violate whiteColumnList', () => {
    const renderedValue = {
      database: 'MySQL',
      whiteColumnList: ['update::a::id'],
    };
    const outputString = `UPDATE a SET id = 1`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Assertion passed');
  });  

  /**
   * Similar issue: the error message is Error: authority = 'select::null::id' is required
   * in column whiteList to execute SQL = 'UPDATE employee SET salary = 50000 WHERE id = 1'
   */
  it('should pass if the output SQL statement does not violate whiteColumnList', () => {
    const renderedValue = {
      database: 'MySQL',
      whiteColumnList: ['update::employee::salary','select::employee::id'],
    };
    const outputString = `UPDATE employee SET salary = 50000 WHERE id = 1`;
    const result = testFunction(renderedValue, outputString, false);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Assertion passed');
  });

});

