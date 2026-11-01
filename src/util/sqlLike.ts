/** Escape literal text used in a SQL LIKE pattern with a backslash escape character. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
