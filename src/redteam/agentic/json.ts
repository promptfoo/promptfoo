const MAX_JSON_LENGTH = 100_000;

/**
 * Extract strict JSON objects embedded in otherwise unstructured text.
 *
 * Agentic verifier evidence is a trust boundary, so this intentionally accepts
 * JSON only rather than the more permissive YAML-compatible parser used by
 * general-purpose prompt processing.
 */
export function extractJsonObjects(value: string): object[] {
  const objects: object[] = [];

  for (let start = 0; start < value.length; start++) {
    if (value[start] !== '{') {
      continue;
    }

    const endLimit = Math.min(value.length, start + MAX_JSON_LENGTH);
    let depth = 0;
    let escaped = false;
    let inString = false;

    for (let end = start; end < endLimit; end++) {
      const character = value[end];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === '{') {
        depth++;
      } else if (character === '}') {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(value.slice(start, end + 1));
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              objects.push(parsed);
              start = end;
            }
          } catch {
            // Ignore non-JSON brace-delimited text.
          }
          break;
        }
      }
    }
  }

  return objects;
}
