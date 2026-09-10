const MAX_JSON_LENGTH = 100_000;

function parseJsonObject(value: string, start: number, end: number): object | undefined {
  try {
    const parsed: unknown = JSON.parse(value.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Reject malformed evidence at the verifier boundary.
  }
}

/** Extract strict JSON objects embedded in unstructured text. */
export function extractJsonObjects(value: string): object[] {
  value = value.slice(0, MAX_JSON_LENGTH);

  const objects: object[] = [];
  let nestedObjects: Array<{ start: number; value: object }> = [];
  const starts: number[] = [];
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
    } else if (character === '"' && starts.length > 0) {
      inString = true;
    } else if (character === '{') {
      starts.push(index);
    } else if (character === '}' && starts.length > 0) {
      const start = starts.pop()!;
      const parsed = parseJsonObject(value, start, index);
      if (starts.length === 0) {
        if (parsed) {
          objects.push(parsed);
        }
        nestedObjects.length = 0;
      } else if (parsed) {
        nestedObjects = nestedObjects.filter((candidate) => candidate.start < start);
        nestedObjects.push({ start, value: parsed });
      }
    }
  }

  objects.push(...nestedObjects.map(({ value }) => value));
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
    } else if (typeof next === 'string' && next.trim()) {
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
