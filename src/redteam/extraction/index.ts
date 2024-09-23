import invariant from 'tiny-invariant';
import type { RedTeamTask } from './util';
import { fetchRemoteGeneration } from './util';

export async function extractSystemPurpose(prompts: string[]): Promise<string> {
  const result = await fetchRemoteGeneration('purpose' as RedTeamTask, prompts);
  invariant(typeof result === 'string', 'Invalid response from remote generation');
  return result;
}

export async function extractEntities(prompts: string[]): Promise<string[]> {
  const result = await fetchRemoteGeneration('entities' as RedTeamTask, prompts);
  invariant(
    Array.isArray(result) && result.every((item) => typeof item === 'string'),
    'Result from remote generation is not an array of strings',
  );
  return result;
}
