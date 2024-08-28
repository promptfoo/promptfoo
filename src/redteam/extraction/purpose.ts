import type { ApiProvider } from '../../types';
import { createRedTeamGenerationProvider } from '../providers/generation';

export async function extractSystemPurpose(
  provider: ApiProvider,
  prompts: string[],
): Promise<string> {
  const redTeamProvider = createRedTeamGenerationProvider({ task: 'purpose' });

  const result = await redTeamProvider.callApi('', {
    prompt: { raw: '', label: 'purpose' },
    vars: { prompts },
  });

  if ('error' in result) {
    throw new Error(`Error extracting system purpose: ${result.error}`);
  }

  return result.output as string;
}
