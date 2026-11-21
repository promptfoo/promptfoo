import { getEnvString } from '../../envars';

import type { EnvOverrides } from '../../contracts/env';
import type { ElevenLabsBaseConfig } from './types';

/** Resolve provider credentials in order, reading the private environment only when needed. */
export function getElevenLabsApiKey(
  provider: { config: ElevenLabsBaseConfig },
  readEnv: () => EnvOverrides | undefined,
): string | undefined {
  return (
    provider.config.apiKey ||
    (provider.config.apiKeyEnvar &&
      readEnv()?.[provider.config.apiKeyEnvar as keyof EnvOverrides]) ||
    (provider.config.apiKeyEnvar && getEnvString(provider.config.apiKeyEnvar as any)) ||
    readEnv()?.ELEVENLABS_API_KEY ||
    getEnvString('ELEVENLABS_API_KEY')
  );
}
