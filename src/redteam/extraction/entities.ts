import type { ApiProvider } from '../../types';
import { createRedTeamGenerationProvider } from '../providers/generation';

export async function extractEntities(
  provider: ApiProvider,
  prompts: string[],
): Promise<string[]> {
  const redTeamProvider = createRedTeamGenerationProvider({ task: 'entities' });
  
  const result = await redTeamProvider.callApi('', { prompt: { raw: '', label: 'purpose' }, vars: { prompts } });
  
  if ('error' in result) {
    throw new Error(`Error extracting entities: ${result.error}`);
  }
  
  return result.output as string[];
}
