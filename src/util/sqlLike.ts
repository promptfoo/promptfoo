/**
 * Escapes SQL `LIKE` wildcards so user-typed text matches literally.
 *
 * Pair the result with `ESCAPE '\'`. Backslash is escaped first because it is the escape
 * character; `%` and `_` are then prefixed so they no longer match any run or any single
 * character.
 *
 * Case folding is the database's: SQLite's `LIKE` ignores case for ASCII letters only, so
 * `abc` matches `ABC` but `é` does not match `É`.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}
