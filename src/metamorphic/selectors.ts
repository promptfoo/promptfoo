import { captureJson } from './values';

import type { WorkBudget } from './limits';
import type { AnalysisLimits, JsonValue, Observation, Selection, Selector } from './types';

function pointerValue(value: JsonValue, pointer: string, work: WorkBudget): Selection {
  if (pointer === '') {
    return { available: true, value };
  }
  let current = value;
  for (const encoded of pointer.slice(1).split('/')) {
    work.spend();
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object') {
      return { available: false, reason: 'pointer-missing' };
    }
    if (Array.isArray(current) && !/^(0|[1-9]\d*)$/u.test(key)) {
      return { available: false, reason: 'pointer-missing' };
    }
    if (!Object.hasOwn(current, key)) {
      return { available: false, reason: 'pointer-missing' };
    }
    current = (current as Record<string, JsonValue>)[key];
  }
  return { available: true, value: current };
}

/** Decode first, traverse the pointer second, normalize only its selected string. */
export function selectValue(
  observation: Observation | undefined,
  selector: Selector,
  limits: AnalysisLimits,
  work: WorkBudget,
): Selection {
  if (!observation) {
    return { available: false, reason: 'missing-observation' };
  }
  if (observation.sourceStatus === 'execution-failed') {
    return { available: false, reason: 'execution-failed' };
  }
  if (observation.sourceStatus === 'unknown') {
    return { available: false, reason: 'source-status-unknown' };
  }
  let selected = observation[selector.source];
  if (!selected.available) {
    return selected;
  }
  if (selector.decode === 'json') {
    if (typeof selected.value !== 'string') {
      return { available: false, reason: 'decode-requires-string' };
    }
    work.spend(selected.value.length);
    let parsed: unknown;
    try {
      parsed = JSON.parse(selected.value);
    } catch {
      return { available: false, reason: 'invalid-json-output' };
    }
    selected = { available: true, value: captureJson(parsed, limits, work) };
  }
  selected = pointerValue(selected.value, selector.pointer, work);
  if (!selected.available || selector.normalize.length === 0) {
    return selected;
  }
  if (typeof selected.value !== 'string') {
    return { available: false, reason: 'normalization-requires-string' };
  }
  let text = selected.value;
  for (const operation of selector.normalize) {
    work.spend(text.length);
    switch (operation) {
      case 'trim':
        text = text.trim();
        break;
      case 'collapse-whitespace':
        text = text.replace(/\s+/gu, ' ');
        break;
      case 'lowercase':
        text = text.toLowerCase();
        break;
      case 'nfkc':
        text = text.normalize('NFKC');
        break;
    }
    if (Buffer.byteLength(text, 'utf8') > limits.maxValueBytes) {
      throw new Error('Normalized selected string exceeds the byte limit');
    }
  }
  return { available: true, value: text };
}
