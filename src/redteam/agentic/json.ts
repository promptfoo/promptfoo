const MAX_JSON_LENGTH = 100_000;

/** Extract strict JSON objects embedded in unstructured text. */
export function extractJsonObjects(value: string): object[] {
  if (value.length > MAX_JSON_LENGTH) {
    return [];
  }

  const objects: object[] = [];
  let start = -1;
  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
    } else if (character === '"' && depth > 0) {
      inString = true;
    } else if (character === '{') {
      if (depth++ === 0) {
        start = index;
      }
    } else if (character === '}' && depth > 0 && --depth === 0) {
      try {
        const parsed: unknown = JSON.parse(value.slice(start, index + 1));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          objects.push(parsed);
        }
      } catch {
        // Reject malformed evidence at the verifier boundary.
      }
    }
  }

  return objects;
}

/** Bounded, iterative decoding shared by trace and provider evidence. */
export function parseEvidenceCandidates(value: unknown): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const pending: unknown[] = [value];
  let visited = 0;

  while (pending.length && ++visited <= 1000) {
    const next = pending.pop();
    if (Array.isArray(next)) {
      if (next.length > 1000) {
        return [];
      }
      pending.push(...[...next].reverse());
    } else if (next && typeof next === 'object') {
      const record = next as Record<string, unknown>;
      const nested = record.agenticEvidence ?? record.agentSdkEvidence;
      if (nested === undefined) {
        candidates.push(record);
      } else {
        pending.push(nested);
      }
    } else if (typeof next === 'string' && next.trim() && next.length <= MAX_JSON_LENGTH) {
      try {
        pending.push(JSON.parse(next));
      } catch {
        let untagged = next;
        const taggedValues: string[] = [];
        for (const pattern of [
          /<AgenticRuntimeEvidence>([\s\S]*?)<\/AgenticRuntimeEvidence>/gi,
          /<AgenticEvidence>([\s\S]*?)<\/AgenticEvidence>/gi,
          /<AgentSdkEvidence>([\s\S]*?)<\/AgentSdkEvidence>/gi,
        ]) {
          for (const tagged of next.matchAll(pattern)) {
            taggedValues.push(tagged[1]);
          }
          untagged = untagged.replace(pattern, '');
        }
        pending.push(...extractJsonObjects(untagged).reverse(), ...taggedValues.reverse());
      }
    }
  }

  return visited > 1000 ? [] : candidates;
}
