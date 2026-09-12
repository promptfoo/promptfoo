import type { EnvOverrides } from '../contracts/env';

/** Merge low-to-high priority scopes without letting a lower-priority key alias win. */
export function mergeProviderEnv(
  providerPath: string,
  ...layers: (EnvOverrides | undefined)[]
): EnvOverrides | undefined {
  const isCodexSDK = /^openai:(?:codex-sdk|codex)(?::|$)/.test(providerPath);
  let merged: EnvOverrides | undefined;
  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    merged ??= {};
    if (isCodexSDK && (layer.OPENAI_API_KEY || layer.CODEX_API_KEY)) {
      delete merged.OPENAI_API_KEY;
      delete merged.CODEX_API_KEY;
    }
    Object.assign(merged, layer);
  }
  return merged;
}
