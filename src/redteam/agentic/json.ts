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
  const nestedObjects: Array<{ start: number; end: number }> = [];
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
      if (starts.length === 0) {
        const parsed = parseJsonObject(value, start, index);
        if (parsed) {
          objects.push(parsed);
        }
        nestedObjects.length = 0;
      } else {
        while (nestedObjects.length && nestedObjects[nestedObjects.length - 1].start > start) {
          nestedObjects.pop();
        }
        nestedObjects.push({ start, end: index });
      }
    }
  }

  for (const { start, end } of nestedObjects) {
    const parsed = parseJsonObject(value, start, end);
    if (parsed) {
      objects.push(parsed);
    }
  }
  return objects;
}

/** Bounded, iterative decoding shared by trace and provider evidence. */
export function parseEvidenceCandidates(value: unknown): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const pending: unknown[] = [value];
  let visited = 0;
  let findings = 0;
  let records = 0;
  let characters = 0;

  while (pending.length) {
    if (++visited > 4000) {
      throw new Error('Agentic evidence exceeds scan limits and cannot be graded');
    }
    const next = pending.pop();
    if (Array.isArray(next)) {
      if (next.length > 1000) {
        throw new Error('Agentic evidence exceeds scan limits and cannot be graded');
      }
      pending.push(...[...next].reverse());
    } else if (next && typeof next === 'object') {
      const record = next as Record<string, unknown>;
      findings += Array.isArray(record.findings) ? record.findings.length : 0;
      records += Number(record.findings !== undefined);
      if (records > 1000 || findings > 1000) {
        throw new Error('Agentic evidence exceeds scan limits and cannot be graded');
      }
      const nested = [record.agenticEvidence, record.agentSdkEvidence].filter(
        (value) => value !== undefined && value !== null,
      );
      candidates.push(record);
      pending.push(...nested.reverse());
    } else if (typeof next === 'string') {
      characters += next.length;
      if (characters > MAX_JSON_LENGTH) {
        throw new Error('Agentic evidence exceeds scan limits and cannot be graded');
      }
      if (!next.trim()) {
        continue;
      }
      try {
        pending.push(JSON.parse(next));
        continue;
      } catch {
        // Fall through to bounded extraction for mixed prose and JSON.
      }
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

  return candidates;
}
