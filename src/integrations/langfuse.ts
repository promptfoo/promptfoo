import { getEnvString } from '../envars';
import type { LangfuseClient } from '@langfuse/client';

import type { VarValue } from '../types';

const langfuseParams = {
  publicKey: getEnvString('LANGFUSE_PUBLIC_KEY'),
  secretKey: getEnvString('LANGFUSE_SECRET_KEY'),
  baseUrl: getEnvString('LANGFUSE_HOST'),
};

let langfuse: LangfuseClient;

export async function getPrompt(
  id: string,
  vars: Record<string, VarValue>,
  type: 'text' | 'chat' | undefined,
  version?: number,
  label?: string,
): Promise<string> {
  let prompt;

  if (!langfuse) {
    try {
      const { LangfuseClient } = await import('@langfuse/client');
      langfuse = new LangfuseClient(langfuseParams);
    } catch (_err) {
      throw new Error(
        'The @langfuse/client package is required for Langfuse integration. Please install it with: npm install @langfuse/client',
      );
    }
  }

  const options = label ? { label } : {};

  try {
    if (type === 'text' || type === undefined) {
      prompt = await langfuse.prompt.get(id, { version, ...options, type: 'text' });
    } else {
      prompt = await langfuse.prompt.get(id, { version, ...options, type: 'chat' });
    }
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
