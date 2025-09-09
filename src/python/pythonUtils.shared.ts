/**
 * Shared Python utilities for function extraction and analysis
 */

/**
 * Extracts all function names from Python content.
 */
export function extractFunctionNames(content: string): string[] {
  const functionMatches = content.match(/def\s+(\w+)\s*\(/g);
  if (!functionMatches) {
    return [];
  }

  return functionMatches
    .map((match) => {
      const nameMatch = match.match(/def\s+(\w+)/);
      return nameMatch ? nameMatch[1] : '';
    })
    .filter(Boolean);
}

/**
 * Extracts the first function name from Python content.
 */
export function extractFunctionName(content: string): string | null {
  const names = extractFunctionNames(content);
  return names.length > 0 ? names[0] : null;
}

/**
 * Detects if a string contains Python code patterns.
 */
export function hasPythonPatterns(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  return /def\s+\w+\s*\(|^(?:from\s+\w+\s+)?import\s+|#.*$|^\s{2,}/m.test(text);
}
