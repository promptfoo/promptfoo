/** Case-insensitive trace glob matching; * and ? do not consume line terminators. */
export function matchesPattern(spanName: string, pattern: string): boolean {
  const parts = pattern.split('*');
  let cursor = 0;

  // Consume fixed-width segments in order, without backtracking across earlier stars.
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\?/g, '.');
    const regex = new RegExp(
      `${index === 0 ? '^' : ''}${part}${index === parts.length - 1 ? '$' : ''}`,
      'gi',
    );
    regex.lastIndex = cursor;
    const match = regex.exec(spanName);
    if (!match || /[\r\n\u2028\u2029]/.test(spanName.slice(cursor, match.index))) {
      return false;
    }
    cursor = match.index + match[0].length;
  }
  return true;
}
