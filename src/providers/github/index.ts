import type { ProviderOptions } from '../../types/providers';
import type { ProviderLoadContext } from '../registryTypes';

export const GITHUB_MODELS_RETIREMENT_MESSAGE =
  'GitHub Models was retired on July 30, 2026, including its inference API. ' +
  'Configure another provider with its own credentials. GitHub Copilot is a separate service. ' +
  'See https://docs.github.com/en/github-models';

export function createGitHubProvider(
  _providerPath: string,
  _providerOptions: ProviderOptions,
  _context: ProviderLoadContext,
): never {
  throw new Error(GITHUB_MODELS_RETIREMENT_MESSAGE);
}
