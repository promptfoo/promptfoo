import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';
import { setupCommonMocks } from './testUtils';

// Setup common mocks
setupCommonMocks();

describe('SQL assertions', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Basic SQL validation
  it('should pass when the is-sql assertion passes for a valid SQL statement', async () => {
    const output = 'SELECT id, name FROM users';
    const isSqlAssertion: Assertion = {
      type: 'is-sql',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isSqlAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the is-sql assertion fails for an invalid SQL statement', async () => {
    const output = 'SELECT * FROM orders ORDERY BY order_date';
    const isSqlAssertion: Assertion = {
      type: 'is-sql',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isSqlAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: false,
      reason: 'SQL statement does not conform to the provided MySQL database syntax.',
    });
  });

  // Not-is-sql assertions
  it('should pass when the not-is-sql assertion passes for an invalid SQL statement', async () => {
    const output = 'SELECT * FROM orders ORDERY BY order_date';
    const notIsSqlAssertion: Assertion = {
      type: 'not-is-sql',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: notIsSqlAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the not-is-sql assertion fails for a valid SQL statement', async () => {
    const output = 'SELECT id, name FROM users';
    const notIsSqlAssertion: Assertion = {
      type: 'not-is-sql',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: notIsSqlAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: false,
      reason: 'The output SQL statement is valid',
    });
  });

  // SQL with specific database type
  it('should pass when the is-sql assertion passes with MySQL syntax', async () => {
    const output = 'SELECT id, name FROM users';
    const isSqlAssertionWithDatabase: Assertion = {
      type: 'is-sql',
      value: {
        databaseType: 'MySQL',
      },
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isSqlAssertionWithDatabase,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the is-sql assertion fails with MySQL-specific syntax in PostgreSQL mode', async () => {
    const output = 'SELECT id, name FROM users LIMIT 5, 10'; // MySQL-specific LIMIT syntax
    const isSqlAssertionWithDatabase: Assertion = {
      type: 'is-sql',
      value: {
        databaseType: 'PostgreSQL',
      },
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isSqlAssertionWithDatabase,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: false,
      reason: expect.stringContaining(
        'SQL statement does not conform to the provided PostgreSQL database syntax',
      ),
    });
  });

  // SQL with allowed tables
  it('should pass when the is-sql assertion passes with allowed tables', async () => {
    const output = 'SELECT * FROM departments';
    const isSqlAssertionWithAllowedTables: Assertion = {
      type: 'is-sql',
      value: {
        databaseType: 'MySQL',
        allowedTables: ['(select|update|insert|delete)::null::departments'],
      },
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isSqlAssertionWithAllowedTables,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the is-sql assertion fails with disallowed tables', async () => {
    const output = 'SELECT * FROM employees';
    const isSqlAssertionWithAllowedTables: Assertion = {
      type: 'is-sql',
      value: {
        databaseType: 'MySQL',
        allowedTables: ['(select|update|insert|delete)::null::departments'],
      },
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isSqlAssertionWithAllowedTables,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: false,
      reason: expect.stringContaining(
        "SQL validation failed: authority = 'select::null::employees' is required in table whiteList",
      ),
    });
  });

  // SQL with allowed columns
  it('should pass when the is-sql assertion passes with allowed columns', async () => {
    const output = 'SELECT name FROM users';
    const isSqlAssertionWithAllowedColumns: Assertion = {
      type: 'is-sql',
      value: {
        databaseType: 'MySQL',
        allowedColumns: ['select::null::name', 'select::null::id'],
      },
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isSqlAssertionWithAllowedColumns,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the is-sql assertion fails with disallowed columns', async () => {
    const output = 'SELECT age FROM users';
    const isSqlAssertionWithAllowedColumns: Assertion = {
      type: 'is-sql',
      value: {
        databaseType: 'MySQL',
        allowedColumns: ['select::null::name', 'select::null::id'],
      },
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isSqlAssertionWithAllowedColumns,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: false,
      reason: expect.stringContaining(
        "SQL validation failed: authority = 'select::null::age' is required in column whiteList",
      ),
    });
  });
});
