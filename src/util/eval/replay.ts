import { generateIdFromPrompt } from '../../models/prompt';
import { sha256 } from '../createHash';

interface PersistedPrompt {
  id?: string;
  raw: string;
  label: string;
  config?: unknown;
}

interface ReplayPrompt {
  raw: string;
  label: string;
  config?: unknown;
}

interface PromptSelection {
  prompts: Array<{ id: string; fingerprint: string }>;
}

function getPromptFingerprint(prompt: ReplayPrompt): string {
  return sha256(
    JSON.stringify(prompt, (_key, value) =>
      typeof value === 'function' ? Function.prototype.toString.call(value) : value,
    ),
  );
}

export function createPromptSelection(prompts: ReplayPrompt[]): PromptSelection {
  return {
    prompts: prompts.map((prompt) => ({
      id: generateIdFromPrompt(prompt),
      fingerprint: getPromptFingerprint(prompt),
    })),
  };
}

export function applyPromptSelection(
  prompts: ReplayPrompt[],
  selection: PromptSelection,
): ReplayPrompt[] {
  if (!selection || !Array.isArray(selection.prompts)) {
    throw new Error('Stored prompt selection is invalid.');
  }
  const promptsById = new Map<string, ReplayPrompt[]>();
  for (const prompt of prompts) {
    const promptId = generateIdFromPrompt(prompt);
    const matchingPrompts = promptsById.get(promptId) ?? [];
    matchingPrompts.push(prompt);
    promptsById.set(promptId, matchingPrompts);
  }
  return selection.prompts.map((selectedPrompt, index) => {
    if (
      typeof selectedPrompt?.id !== 'string' ||
      selectedPrompt.id.length === 0 ||
      typeof selectedPrompt.fingerprint !== 'string' ||
      selectedPrompt.fingerprint.length === 0
    ) {
      throw new Error(`Stored prompt selection entry ${index} is invalid.`);
    }
    const prompt = promptsById
      .get(selectedPrompt.id)
      ?.find((candidate) => getPromptFingerprint(candidate) === selectedPrompt.fingerprint);
    if (!prompt) {
      throw new Error(
        `Selected prompt ${index} no longer exists in the resolved configuration. The evaluation was not changed.`,
      );
    }
    return prompt;
  });
}

/** Restore one prompt definition per prompt ID from provider-expanded persisted prompts. */
export function getPromptsForReplay(
  prompts: PersistedPrompt[],
  resolvedPrompts: ReplayPrompt[] = [],
): ReplayPrompt[] {
  const promptsById = new Map<
    string,
    Array<{ fingerprint: string; key: string; prompt: ReplayPrompt }>
  >();
  const persistedPrompts: Array<{ key: string; prompt: ReplayPrompt }> = [];
  const seenPromptKeys = new Set<string>();
  const legacyPrompts: ReplayPrompt[] = [];
  for (const prompt of prompts) {
    const replayPrompt = {
      raw: prompt.raw,
      label: prompt.label,
      config: prompt.config,
    };
    if (prompt.id) {
      const fingerprint = getPromptFingerprint(replayPrompt);
      const key = `${prompt.id}\0${fingerprint}`;
      if (!seenPromptKeys.has(key)) {
        seenPromptKeys.add(key);
        const candidates = promptsById.get(prompt.id) ?? [];
        candidates.push({ fingerprint, key, prompt: replayPrompt });
        promptsById.set(prompt.id, candidates);
        persistedPrompts.push({ key, prompt: replayPrompt });
      }
    } else {
      legacyPrompts.push(replayPrompt);
    }
  }

  const orderedPrompts: ReplayPrompt[] = [];
  const matchedPromptKeys = new Set<string>();
  for (const prompt of resolvedPrompts) {
    const promptId = generateIdFromPrompt(prompt);
    const candidates = promptsById.get(promptId);
    const persistedPrompt =
      candidates?.find((candidate) => candidate.fingerprint === getPromptFingerprint(prompt)) ??
      candidates?.[0];
    if (persistedPrompt) {
      orderedPrompts.push(persistedPrompt.prompt);
      matchedPromptKeys.add(persistedPrompt.key);
    }
  }

  orderedPrompts.push(
    ...persistedPrompts
      .filter(({ key }) => !matchedPromptKeys.has(key))
      .map(({ prompt }) => prompt),
    ...legacyPrompts,
  );
  return orderedPrompts;
}
