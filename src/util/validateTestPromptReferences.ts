import { doesPromptRefMatch } from './promptMatching';

import type { Prompt, TestCase } from '../types/index';

export type PromptReferenceSource = {
  path: string;
  content: string;
};

type ValidateTestPromptReferencesOptions = {
  promptReferenceSources?: PromptReferenceSource[];
};

export class PromptReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptReferenceValidationError';
  }
}

type PromptReferenceContext = {
  section: 'tests' | 'defaultTest';
  description?: string;
};

function isYamlKey(trimmedLine: string, key: string): boolean {
  return trimmedLine === `${key}:` || trimmedLine.startsWith(`${key}: `);
}

function unquote(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}

type SectionItem = { description?: string; location?: string };

function refLocation(
  source: PromptReferenceSource,
  line: string,
  lineNumber: number,
  ref: string,
): string | undefined {
  const column = line.indexOf(ref);
  return column === -1 ? undefined : `${source.path}:${lineNumber}:${column + 1}`;
}

/**
 * Split a source's target section into list items, recording each item's
 * description and the first line within its `prompts:` block containing
 * `ref`. Nested prompt refs always indent deeper than item markers, so item
 * boundaries are list markers at the section's first list indent.
 */
function collectSectionItems(
  source: PromptReferenceSource,
  ref: string,
  section: PromptReferenceContext['section'],
): SectionItem[] {
  const lines = source.content.split(/\r?\n/);
  let inSection = false;
  let itemIndent: number | undefined;
  let promptsIndent: number | undefined;
  const items: SectionItem[] = [{}];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const indent = line.search(/\S/);
    const isListItem = trimmed === '-' || trimmed.startsWith('- ');

    if (!inSection) {
      if (indent === 0 && isYamlKey(trimmed, section)) {
        inSection = true;
        items[0].location = refLocation(source, line, i + 1, ref);
      }
      continue;
    }
    if (indent === 0 && !isListItem) {
      break;
    }

    if (isListItem) {
      itemIndent ??= indent;
      if (indent <= itemIndent) {
        items.push({});
      }
    }

    const item = items[items.length - 1];
    const stripped = trimmed.replace(/^-\s*/, '');
    if (isYamlKey(stripped, 'description')) {
      item.description ??= unquote(stripped.slice('description:'.length).trim());
      continue;
    }
    // Only search inside the item's `prompts:` block so the same string in
    // vars or assertions doesn't steal the location.
    if (isYamlKey(stripped, 'prompts')) {
      promptsIndent = indent + (trimmed.length - stripped.length);
    } else if (promptsIndent === undefined || indent <= promptsIndent) {
      promptsIndent = undefined;
      continue;
    }
    item.location ??= refLocation(source, line, i + 1, ref);
  }

  return items;
}

/**
 * Best-effort `path:line:column` for a prompt ref, without a YAML parser.
 * Prefers the item whose description matches the erroring test's description,
 * falling back to the first occurrence in the right section.
 */
function findPromptReferenceLocation(
  ref: string,
  sources: PromptReferenceSource[] | undefined,
  context: PromptReferenceContext,
): string | undefined {
  const targetDescription = context.section === 'tests' ? context.description : undefined;
  let fallback: string | undefined;

  for (const source of sources ?? []) {
    const withRef = collectSectionItems(source, ref, context.section).filter(
      (item) => item.location,
    );
    const match =
      targetDescription === undefined
        ? withRef[0]
        : withRef.find((item) => item.description === targetDescription);
    if (match) {
      return match.location;
    }
    fallback ??= withRef[0]?.location;
  }

  return fallback;
}

/**
 * Validate that all prompt references in test cases exist in the available prompts.
 * This is strict parse-time validation - any invalid reference is an error.
 *
 * @param tests - Array of test cases to validate
 * @param prompts - Array of available prompts
 * @param defaultTest - Optional default test case to validate
 * @param options - Optional source files for YAML location hints
 * @throws PromptReferenceValidationError if any prompt reference is invalid
 */
export function validateTestPromptReferences(
  tests: TestCase[],
  prompts: Prompt[],
  defaultTest?: Partial<TestCase>,
  options?: ValidateTestPromptReferencesOptions,
): void {
  const check = (refs: string[] | undefined, label: string, context: PromptReferenceContext) => {
    if (!Array.isArray(refs)) {
      return;
    }
    for (const ref of refs) {
      if (prompts.some((prompt) => doesPromptRefMatch(ref, prompt))) {
        continue;
      }
      const available = [...new Set(prompts.flatMap((p) => [p.label, p.id]))]
        .filter((id): id is string => !!id)
        .sort();
      const message =
        `${label} references prompt "${ref}" which does not exist.\n` +
        `Available prompts: [${available.join(', ')}]`;
      const location = findPromptReferenceLocation(ref, options?.promptReferenceSources, context);
      throw new PromptReferenceValidationError(location ? `${location}: ${message}` : message);
    }
  };

  check(defaultTest?.prompts, 'defaultTest', { section: 'defaultTest' });
  tests.forEach((test, testIdx) => {
    const testDesc = test.description ? ` ("${test.description}")` : '';
    check(test.prompts, `Test #${testIdx + 1}${testDesc}`, {
      section: 'tests',
      description: test.description,
    });
  });
}
