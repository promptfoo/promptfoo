import { hasDuplicateJsonKeys } from '../../tracing/jsonKeys';

const MAX_JSON_LENGTH = 100_000;

function parseEvidenceJson(value: string): unknown {
  const parsed: unknown = JSON.parse(value);
  if (hasDuplicateJsonKeys(value)) {
    throw new Error('Agentic evidence contains duplicate JSON properties and cannot be graded');
  }
  return parsed;
}

function parseJsonContainer(value: string, start: number, end: number): object | undefined {
  try {
    const parsed: unknown = parseEvidenceJson(value.slice(start, end + 1));
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    // Reject malformed evidence at the verifier boundary.
  }
}

function scanJsonContainers(
  value: string,
  tagged = false,
): { values: object[]; malformed: boolean } {
  value = value.slice(0, MAX_JSON_LENGTH);

  const objects: object[] = [];
  const nestedObjects: Array<{ start: number; end: number }> = [];
  const starts: number[] = [];
  let escaped = false;
  let inString = false;
  let malformed = false;

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
    } else if (
      starts.length === 0 &&
      character === '<' &&
      /^<\/?(?:AgenticRuntime|Agentic|AgentSdk)Evidence\b/i.test(value.slice(index))
    ) {
      malformed = true;
    } else if (character === '"' && starts.length > 0) {
      inString = true;
    } else if (character === '{' || character === '[') {
      starts.push(index);
    } else if (character === '}' || character === ']') {
      if (starts.length === 0) {
        malformed ||= tagged;
        continue;
      }
      const start = starts.pop()!;
      if (starts.length === 0) {
        const parsed = parseJsonContainer(value, start, index);
        if (parsed) {
          objects.push(parsed);
        } else {
          // Plain bracketed labels such as [INFO] are prose outside evidence tags.
          malformed ||= tagged || !/^\[[\w .:/-]+\]$/.test(value.slice(start, index + 1));
          for (const { start, end } of nestedObjects) {
            const nested = parseJsonContainer(value, start, end);
            if (nested) {
              objects.push(nested);
            }
          }
        }
        nestedObjects.length = 0;
      } else {
        while (nestedObjects.length && nestedObjects[nestedObjects.length - 1].start > start) {
          nestedObjects.pop();
        }
        nestedObjects.push({ start, end: index });
      }
    } else if (tagged && starts.length === 0 && !/[ \t\r\n]/.test(character)) {
      malformed = true;
    }
  }

  for (const { start, end } of nestedObjects) {
    const parsed = parseJsonContainer(value, start, end);
    if (parsed) {
      objects.push(parsed);
    }
  }
  return { values: objects, malformed: malformed || starts.length > 0 };
}

/** Extract strict JSON objects embedded in unstructured text. */
export function extractJsonObjects(value: string): object[] {
  const pending = scanJsonContainers(value).values.reverse();
  const objects: object[] = [];
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...[...value].reverse());
    } else if (value && typeof value === 'object') {
      objects.push(value);
    }
  }
  return objects;
}

export function requireVisibleEvidenceIdentity(value: unknown): void {
  if (typeof value === 'string' && /\[(?:REDACTED|TRUNCATED)\]|<redacted>/.test(value)) {
    throw new Error('Agentic verifier evidence was redacted and cannot be graded');
  }
}

export function normalizePluginId(value: unknown): string | undefined {
  requireVisibleEvidenceIdentity(value);
  return typeof value === 'string'
    ? value
        .trim()
        .replace(/^promptfoo:redteam:/, '')
        .trim() || undefined
    : undefined;
}

/** Bounded, iterative decoding shared by trace and provider evidence. */
export function parseEvidenceCandidates(
  value: unknown,
  { preserveInvalid = false }: { preserveInvalid?: boolean } = {},
): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const pending: { value: unknown; pluginId?: string; tagged?: boolean }[] = [{ value }];
  let visited = 0;
  let findings = 0;
  let records = 0;
  let characters = 0;
  let decodedCharacters = 0;
  let decodedNodes = 0;

  while (pending.length) {
    if (++visited > 4000) {
      throw new Error('Agentic evidence exceeds scan limits and cannot be graded');
    }
    const { value: next, pluginId: inheritedPluginId, tagged } = pending.pop()!;
    if (Array.isArray(next)) {
      if (next.length > 1000) {
        throw new Error('Agentic evidence exceeds scan limits and cannot be graded');
      }
      if (preserveInvalid && next.length === 0) {
        candidates.push({ pluginId: inheritedPluginId, verifierFailed: true });
      }
      pending.push(
        ...[...next].reverse().map((value) => ({ value, pluginId: inheritedPluginId, tagged })),
      );
    } else if (next && typeof next === 'object') {
      const record = next as Record<string, unknown>;
      const explicitPluginId = normalizePluginId(record.pluginId);
      const pluginId = explicitPluginId ?? inheritedPluginId;
      Object.keys(record).forEach(requireVisibleEvidenceIdentity);
      if (Array.isArray(record.findings)) {
        for (const finding of record.findings) {
          if (finding && typeof finding === 'object') {
            Object.keys(finding).forEach(requireVisibleEvidenceIdentity);
            const findingPluginId = normalizePluginId(finding.pluginId);
            if (pluginId && findingPluginId && findingPluginId !== pluginId) {
              throw new Error('Agentic evidence has conflicting plugin IDs and cannot be graded');
            }
          }
        }
      }
      findings += Array.isArray(record.findings) ? record.findings.length : 0;
      records += Number(record.findings !== undefined);
      if (records > 1000 || findings > 1000) {
        throw new Error('Agentic evidence exceeds scan limits and cannot be graded');
      }
      const nested = Object.entries(record).filter(
        ([key, value]) =>
          /^(?:agentic|agentSdk)Evidence$/i.test(key) && (preserveInvalid || value != null),
      );
      if (
        record.findings !== undefined ||
        record.verifierFailed !== undefined ||
        nested.length === 0
      ) {
        try {
          JSON.stringify(record, (key, value) => {
            decodedCharacters += key.length + (typeof value === 'string' ? value.length : 0);
            if (++decodedNodes > 4000 || decodedCharacters > MAX_JSON_LENGTH) {
              throw new Error('Evidence scan limit');
            }
            return value;
          });
        } catch {
          throw new Error(
            'Agentic evidence exceeds scan limits or is not valid JSON and cannot be graded',
          );
        }
        candidates.push(
          pluginId !== undefined && record.pluginId !== pluginId ? { ...record, pluginId } : record,
        );
      }
      pending.push(...nested.reverse().map(([, value]) => ({ value, pluginId, tagged })));
    } else if (typeof next === 'string') {
      characters += next.length;
      if (characters > MAX_JSON_LENGTH) {
        throw new Error('Agentic evidence exceeds scan limits and cannot be graded');
      }
      if (!next.trim()) {
        if (preserveInvalid) {
          candidates.push({ pluginId: inheritedPluginId, verifierFailed: true });
        }
        continue;
      }
      try {
        pending.push({ value: parseEvidenceJson(next), pluginId: inheritedPluginId, tagged });
        continue;
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }
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
      const scanned = scanJsonContainers(untagged, tagged);
      const extracted = [
        ...scanned.values.reverse().map((value) => ({ value, tagged })),
        ...taggedValues.reverse().map((value) => ({ value, tagged: true })),
      ];
      if (preserveInvalid && (scanned.malformed || extracted.length === 0)) {
        candidates.push({ pluginId: inheritedPluginId, verifierFailed: true });
      }
      pending.push(
        ...extracted.map((entry) => ({
          ...entry,
          pluginId: inheritedPluginId,
        })),
      );
    } else if (preserveInvalid) {
      candidates.push({ pluginId: inheritedPluginId, verifierFailed: true });
    }
  }

  return candidates;
}
