import { getEnvString } from '../envars';
import { isMissingPackageImportError } from '../util/packageImportErrors';
import type { ChatPromptClient, LangfuseClient, TextPromptClient } from '@langfuse/client';

import type { VarValue } from '../types';

type LangfuseParams = {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
};

type LangfuseClientState = {
  params: LangfuseParams;
  // A promise, so concurrent first fetches share one client and its prompt cache.
  client: Promise<LangfuseClient>;
  // The SDK caches a prompt only once its first request completes, so concurrent renders of the
  // same prompt would each send a request. They share the in-flight request instead.
  inFlightPrompts: Map<string, Promise<TextPromptClient | ChatPromptClient>>;
};

let langfuseState: LangfuseClientState | undefined;

// Read at call time: --env-file and the config's `env:` block are applied after this module is imported.
// Blank values count as unset; the SDK only falls back to its own env vars and defaults for `undefined`.
// LANGFUSE_BASE_URL is the SDK's name for the host, so accept it too; LANGFUSE_HOST wins if both are set.
function getLangfuseParams(): LangfuseParams {
  return {
    publicKey: getEnvString('LANGFUSE_PUBLIC_KEY') || undefined,
    secretKey: getEnvString('LANGFUSE_SECRET_KEY') || undefined,
    baseUrl: getEnvString('LANGFUSE_HOST') || getEnvString('LANGFUSE_BASE_URL') || undefined,
  };
}

async function createLangfuseClient(params: LangfuseParams): Promise<LangfuseClient> {
  try {
    const { LangfuseClient } = await import('@langfuse/client');
    return new LangfuseClient(params);
  } catch (err) {
    // Only a missing @langfuse/client is fixed by installing it. Anything else, such as a missing
    // dependency of an installed SDK, is more useful as the original error.
    if (isMissingPackageImportError(err, '@langfuse/client')) {
      throw new Error(
        'The @langfuse/client package is required for Langfuse integration. Please install it with: npm install @langfuse/client',
      );
    }
    throw err;
  }
}

function getLangfuseState(): LangfuseClientState {
  const params = getLangfuseParams();
  if (
    langfuseState &&
    langfuseState.params.publicKey === params.publicKey &&
    langfuseState.params.secretKey === params.secretKey &&
    langfuseState.params.baseUrl === params.baseUrl
  ) {
    return langfuseState;
  }

  const state: LangfuseClientState = {
    params,
    client: createLangfuseClient(params),
    inFlightPrompts: new Map(),
  };
  // Don't keep a client that failed to load; the next fetch should try again.
  state.client.catch(() => {
    if (langfuseState === state) {
      langfuseState = undefined;
    }
  });
  langfuseState = state;
  return state;
}

export async function getPrompt(
  id: string,
  vars: Record<string, VarValue>,
  type: 'text' | 'chat' | undefined,
  version?: number,
  label?: string,
): Promise<string> {
  const { client, inFlightPrompts } = getLangfuseState();
  const langfuse = await client;

  const promptType = type === 'chat' ? 'chat' : 'text';
  const requestKey = JSON.stringify([id, promptType, version ?? null, label ?? null]);
  let request = inFlightPrompts.get(requestKey);
  if (!request) {
    const options = label ? { label } : {};
    request =
      promptType === 'chat'
        ? langfuse.prompt.get(id, { version, ...options, type: 'chat' })
        : langfuse.prompt.get(id, { version, ...options, type: 'text' });
    inFlightPrompts.set(requestKey, request);
    const clearRequest = () => inFlightPrompts.delete(requestKey);
    request.then(clearRequest, clearRequest);
  }

  let prompt: TextPromptClient | ChatPromptClient;
  try {
    prompt = await request;
  } catch (err) {
    const error = err as Error;
    // Provide more context in error messages
    if (label) {
      throw new Error(
        `Failed to fetch Langfuse prompt "${id}" with label "${label}": ${error.message || error}`,
      );
    } else if (version === undefined) {
      throw new Error(`Failed to fetch Langfuse prompt "${id}": ${error.message || error}`);
    } else {
      throw new Error(
        `Failed to fetch Langfuse prompt "${id}" version ${version}: ${error.message || error}`,
      );
    }
  }

  // Convert VarValue to strings since Langfuse compile() expects Record<string, string>
  const stringVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    stringVars[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  const compiledPrompt = prompt.compile(stringVars);
  if (typeof compiledPrompt !== 'string') {
    return JSON.stringify(compiledPrompt);
  }
  return compiledPrompt;
}
