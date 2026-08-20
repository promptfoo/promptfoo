import invariant from '../../util/invariant';
import { type BijectionMapping, decodeBijection } from '../strategies/bijection';
import { callTargetProvider } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/providers';

interface BijectionProviderConfig {
  mapping: BijectionMapping;
  responseStart: string;
  responseEnd: string;
}

function isBijectionMapping(value: unknown): value is BijectionMapping {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const entries = Object.entries(value);
  return (
    entries.length === 26 &&
    entries.every(
      ([key, entry]) =>
        /^[a-z]$/.test(key) && typeof entry === 'string' && /^(?:[a-z]|\d{2,4})$/.test(entry),
    ) &&
    new Set(entries.map(([, entry]) => entry)).size === entries.length
  );
}

export function decodeMarkedBijectionResponse(
  output: string,
  config: BijectionProviderConfig,
): { decoded: boolean; output: string } {
  const trimmed = output.trim();
  if (!trimmed.startsWith(config.responseStart) || !trimmed.endsWith(config.responseEnd)) {
    return { decoded: false, output };
  }

  const encoded = trimmed.slice(config.responseStart.length, -config.responseEnd.length).trim();
  if (encoded.includes(config.responseStart) || encoded.includes(config.responseEnd)) {
    return { decoded: false, output };
  }

  return {
    decoded: true,
    output: decodeBijection(encoded, config.mapping),
  };
}

export default class BijectionProvider implements ApiProvider {
  readonly config: BijectionProviderConfig;

  constructor(options: Partial<BijectionProviderConfig> = {}) {
    invariant(isBijectionMapping(options.mapping), 'Expected a valid bijection mapping to be set');
    invariant(
      typeof options.responseStart === 'string' && options.responseStart.length > 0,
      'Expected responseStart to be set',
    );
    invariant(
      typeof options.responseEnd === 'string' && options.responseEnd.length > 0,
      'Expected responseEnd to be set',
    );
    invariant(options.responseStart !== options.responseEnd, 'Expected response markers to differ');
    this.config = {
      mapping: options.mapping,
      responseStart: options.responseStart,
      responseEnd: options.responseEnd,
    };
  }

  id() {
    return 'promptfoo:redteam:bijection';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    invariant(context?.originalProvider, 'Expected originalProvider to be set');

    const targetResponse = await callTargetProvider(
      context.originalProvider,
      prompt,
      context,
      options,
    );
    if (targetResponse.error || typeof targetResponse.output !== 'string') {
      return targetResponse;
    }

    const decoded = decodeMarkedBijectionResponse(targetResponse.output, this.config);
    return {
      ...targetResponse,
      output: decoded.output,
      prompt,
      metadata: {
        ...targetResponse.metadata,
        bijectionDecoded: decoded.decoded,
        redteamFinalPrompt: prompt,
      },
    };
  }
}
