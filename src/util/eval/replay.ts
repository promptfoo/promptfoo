import { generateIdFromPrompt } from '../../models/prompt';
import { sha256 } from '../createHash';
import { redactSecretLeaves, stableStringify } from '../sanitizer';

interface PersistedPrompt {
  id?: string;
  raw: string;
  label: string;
  config?: unknown;
  sourceHash?: string;
}

interface ReplayPrompt {
  raw: string;
  label: string;
  config?: unknown;
  function?: any;
  sourceHash?: string;
}

interface PromptSelection {
  prompts: Array<{ id: string; fingerprint: string; reuse?: boolean }>;
}

function getPromptFingerprint(prompt: ReplayPrompt): string {
  // Raw JSON.stringify throws on bigint/circular prompt config and fingerprints
  // raw credential values (so rotating a prompt-config secret would reject an
  // otherwise-equivalent replay). Use the shared cycle/BigInt-safe canonicalizer
  // that redacts only credential leaves while preserving semantic prompt config.
  return sha256(
    stableStringify({
      raw: prompt.raw,
      label: prompt.label,
      config: redactSecretLeaves(prompt.config),
      ...(prompt.sourceHash && { sourceHash: prompt.sourceHash }),
    }),
  );
}

export function createPromptSelection(prompts: ReplayPrompt[]): PromptSelection {
  const seen = new WeakSet<object>();
  return {
    prompts: prompts.map((prompt) => {
      const reuse = seen.has(prompt);
      seen.add(prompt);
      return {
        id: generateIdFromPrompt(prompt),
        fingerprint: getPromptFingerprint(prompt),
        ...(reuse ? { reuse } : {}),
      };
    }),
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
  const matched = new Map<string, ReplayPrompt>();
  return selection.prompts.map((selectedPrompt, index) => {
    if (
      typeof selectedPrompt?.id !== 'string' ||
      selectedPrompt.id.length === 0 ||
      typeof selectedPrompt.fingerprint !== 'string' ||
      selectedPrompt.fingerprint.length === 0
    ) {
      throw new Error(`Stored prompt selection entry ${index} is invalid.`);
    }
    const candidates = promptsById.get(selectedPrompt.id);
    const key = selectedPrompt.id + '\\0' + selectedPrompt.fingerprint;
    if (selectedPrompt.reuse && matched.has(key)) {
      return matched.get(key)!;
    }
    const candidateIndex = candidates?.findIndex(
      (candidate) => getPromptFingerprint(candidate) === selectedPrompt.fingerprint,
    );
    const prompt =
      candidateIndex === undefined || candidateIndex < 0
        ? undefined
        : candidates?.splice(candidateIndex, 1)[0];
    if (!prompt) {
      throw new Error(
        `Selected prompt ${index} no longer exists in the resolved configuration. The evaluation was not changed.`,
      );
    }
    matched.set(key, prompt);
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
      ...(prompt.sourceHash && { sourceHash: prompt.sourceHash }),
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
    const fingerprint = getPromptFingerprint(prompt);
    const candidates = promptsById.get(promptId);
    const persistedPrompt =
      candidates?.find((candidate) => candidate.fingerprint === fingerprint) ?? candidates?.[0];
    if (persistedPrompt) {
      if (persistedPrompt.prompt.sourceHash !== prompt.sourceHash) {
        throw new Error(
          'Executable prompt implementation changed or cannot be verified. The evaluation was not changed.',
        );
      }
      orderedPrompts.push({
        ...persistedPrompt.prompt,
        ...(persistedPrompt.fingerprint === fingerprint ? { config: prompt.config } : {}),
        ...(prompt.function ? { function: prompt.function } : {}),
      });
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
