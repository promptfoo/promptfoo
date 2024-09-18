import invariant from 'tiny-invariant';
import type { RedTeamTask } from './util';
import { fetchRemoteGeneration } from './util';

export async function extractSystemPurpose(prompts: string[]): Promise<string> {
  const result = await fetchRemoteGeneration('purpose' as RedTeamTask, prompts);
  invariant(typeof result === 'string', 'Invalid response from remote generation');
  return result;
}
