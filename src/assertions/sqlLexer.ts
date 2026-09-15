const BRACKET_IDENTIFIER_DATABASES = new Set(['TransactSQL', 'Sqlite']);
const DOUBLE_QUOTED_IDENTIFIER_DATABASES = new Set([
  'postgresql',
  'postgres',
  'oracle',
  'oracle.db',
  'snowflake',
  'clickhouse',
]);
const DOUBLE_QUOTED_LITERAL_DATABASES = new Set(['bigquery']);
const HASH_COMMENT_DATABASES = new Set(['mysql', 'mariadb', 'bigquery', 'clickhouse']);
const SQL_EXPRESSION_PLACEHOLDER = ' ? ';

const DOLLAR_QUOTE_DELIMITER_PATTERN = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

function readDollarQuoteDelimiter(sql: string, start: number): string | undefined {
  return DOLLAR_QUOTE_DELIMITER_PATTERN.exec(sql.slice(start))?.[0];
}

function findQuotedTextEnd(sql: string, start: number, quote: string): number | undefined {
  const closingQuote = quote === '[' ? ']' : quote;
  let cursor = start + 1;
  while (cursor < sql.length) {
    if (closingQuote !== ']' && sql[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (sql[cursor] === closingQuote) {
      if (sql[cursor + 1] === closingQuote) {
        cursor += 2;
        continue;
      }
      return cursor + 1;
    }
    cursor++;
  }
  return undefined;
}

export function stripIgnoredSqlText(sql: string, databaseType: string, maskValues = false): string {
  const chunks: string[] = [];
  const literals = new Map<string, string>();
  let literalPrefix = ':literal_';
  if (maskValues) {
    for (const match of sql.matchAll(/:literal_+/g)) {
      if (match[0].length >= literalPrefix.length) {
        literalPrefix = `${match[0]}_`;
      }
    }
  }
  const placeholder = (literal: string) => {
    if (!maskValues) {
      return SQL_EXPRESSION_PLACEHOLDER;
    }
    const token = literals.get(literal) ?? `${literalPrefix}${literals.size + 1}`;
    literals.set(literal, token);
    return ` ${token} `;
  };
  const database = databaseType.toLowerCase();
  const supportsBracketIdentifiers =
    BRACKET_IDENTIFIER_DATABASES.has(databaseType) ||
    ['mssql', 'microsoft.sql_server', 'transactsql', 'sqlite'].includes(database);
  let plainTextStart = 0;
  let cursor = 0;

  while (cursor < sql.length) {
    const character = sql[cursor];
    if (
      maskValues &&
      /q/i.test(character) &&
      sql[cursor + 1] === "'" &&
      !/\w/.test(sql[cursor - 1] ?? '')
    ) {
      throw new Error(
        'SQL trace uses unsupported quoted-literal syntax and cannot be safely graded.',
      );
    }
    let ignoredTextEnd: number | undefined;
    let replacement = ' ';

    if (
      maskValues &&
      character === '#' &&
      !HASH_COMMENT_DATABASES.has(database) &&
      !DOUBLE_QUOTED_IDENTIFIER_DATABASES.has(database) &&
      !supportsBracketIdentifiers
    ) {
      throw new Error(
        'SQL trace has ambiguous hash syntax; set a supported db.system.name before grading.',
      );
    }

    if (
      maskValues &&
      ((character === '"' &&
        !DOUBLE_QUOTED_IDENTIFIER_DATABASES.has(database) &&
        !DOUBLE_QUOTED_LITERAL_DATABASES.has(database)) ||
        (character === '[' &&
          !supportsBracketIdentifiers &&
          !DOUBLE_QUOTED_IDENTIFIER_DATABASES.has(database) &&
          !DOUBLE_QUOTED_LITERAL_DATABASES.has(database) &&
          !HASH_COMMENT_DATABASES.has(database)))
    ) {
      throw new Error(
        'SQL trace has ambiguous quoted text; set db.system.name or use unambiguous quoting before grading.',
      );
    }

    if (
      character === "'" ||
      character === '"' ||
      character === '`' ||
      (character === '[' && supportsBracketIdentifiers)
    ) {
      const quoteEnd = findQuotedTextEnd(sql, cursor, character);
      if (maskValues && quoteEnd === undefined) {
        throw new Error(
          'SQL trace has an unclosed literal or identifier and cannot be safely graded.',
        );
      }
      ignoredTextEnd = quoteEnd ?? sql.length;
      const quoted = sql.slice(cursor, ignoredTextEnd);
      replacement =
        maskValues &&
        (character === '`' ||
          character === '[' ||
          (character === '"' && DOUBLE_QUOTED_IDENTIFIER_DATABASES.has(database)))
          ? quoted
          : placeholder(quoted);
    } else if (
      (character === '-' &&
        sql[cursor + 1] === '-' &&
        (!['mysql', 'mariadb'].includes(database) ||
          cursor + 2 === sql.length ||
          sql.charCodeAt(cursor + 2) <= 32)) ||
      (character === '#' &&
        HASH_COMMENT_DATABASES.has(database) &&
        (database !== 'clickhouse' || /[!\s]/.test(sql[cursor + 1] ?? ''))) ||
      (database === 'clickhouse' && character === '/' && sql[cursor + 1] === '/')
    ) {
      ignoredTextEnd = cursor + 1;
      while (
        ignoredTextEnd < sql.length &&
        sql[ignoredTextEnd] !== '\r' &&
        sql[ignoredTextEnd] !== '\n'
      ) {
        ignoredTextEnd++;
      }
    } else if (character === '/' && sql[cursor + 1] === '*') {
      if (maskValues && /^\/\*(?:!|M!)/i.test(sql.slice(cursor))) {
        throw new Error('SQL trace uses executable-comment syntax and cannot be safely graded.');
      }
      let nesting = 1;
      ignoredTextEnd = cursor + 2;
      while (ignoredTextEnd < sql.length && nesting > 0) {
        if (sql.startsWith('/*', ignoredTextEnd)) {
          nesting++;
          ignoredTextEnd += 2;
        } else if (sql.startsWith('*/', ignoredTextEnd)) {
          nesting--;
          ignoredTextEnd += 2;
        } else {
          ignoredTextEnd++;
        }
      }
      if (maskValues && nesting > 0) {
        throw new Error('SQL trace has an unclosed comment and cannot be safely graded.');
      }
    } else if (character === '$') {
      const delimiter = readDollarQuoteDelimiter(sql, cursor);
      if (delimiter) {
        const quoteEnd = sql.indexOf(delimiter, cursor + delimiter.length);
        if (maskValues && quoteEnd === -1) {
          throw new Error(
            'SQL trace has an unclosed dollar-quoted literal and cannot be safely graded.',
          );
        }
        ignoredTextEnd = quoteEnd === -1 ? sql.length : quoteEnd + delimiter.length;
        replacement = placeholder(sql.slice(cursor, ignoredTextEnd));
      }
    } else if (maskValues && /[\d.]/.test(character) && !/[\w$?:@]/.test(sql[cursor - 1] ?? '')) {
      const number =
        /^(?:0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/.exec(
          sql.slice(cursor),
        )?.[0];
      if (number) {
        ignoredTextEnd = cursor + number.length;
        replacement = placeholder(number);
      }
    }

    if (ignoredTextEnd === undefined) {
      cursor++;
      continue;
    }

    chunks.push(sql.slice(plainTextStart, cursor), replacement);
    cursor = ignoredTextEnd;
    plainTextStart = cursor;
  }

  chunks.push(sql.slice(plainTextStart));
  return chunks.join('');
}

/** Keep SQL structure while omitting captured values and comments from model input. */
export function redactSqlLiteralsAndComments(sql: string, databaseType = ''): string {
  return stripIgnoredSqlText(sql, databaseType, true)
    .replace(/"(?:\\.|""|[^"\\])*"|`(?:\\.|``|[^`\\])*`|\[(?:\]\]|[^\]])*\]|\s+/g, (text) =>
      /^\s/.test(text) ? ' ' : text,
    )
    .trim();
}
