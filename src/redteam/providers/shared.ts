import cliState from '../../cliState';
import logger from '../../logger';
import { loadApiProviders } from '../../providers';
import { OpenAiChatCompletionProvider } from '../../providers/openai';
import { isProviderOptions, isApiProvider, type RedteamConfig } from '../../types';
import { ATTACKER_MODEL, ATTACKER_MODEL_SMALL, TEMPERATURE } from './constants';

export async function loadRedteamProvider({
  provider,
  preferSmallModel = false,
}: {
  provider?: RedteamConfig['provider'];
  preferSmallModel?: boolean;
} = {}) {
  // FIXME(ian): This approach only works on CLI, it doesn't work when running via node module.
  // That's ok for now because we only officially support redteams from CLI.
  let ret;
  const redteamProvider = provider || cliState.config?.redteam?.provider;
  if (isApiProvider(redteamProvider)) {
    logger.debug(`Using redteam provider: ${redteamProvider}`);
    ret = redteamProvider;
  } else if (typeof redteamProvider === 'string' || isProviderOptions(redteamProvider)) {
    logger.debug(`Loading redteam provider: ${redteamProvider}`);
    ret = (await loadApiProviders([redteamProvider]))[0];
  } else {
    const defaultModel = preferSmallModel ? ATTACKER_MODEL_SMALL : ATTACKER_MODEL;
    logger.debug(`Using default redteam provider: ${defaultModel}`);
    ret = new OpenAiChatCompletionProvider(defaultModel, {
      config: {
        temperature: TEMPERATURE,
        response_format: { type: 'json_object' },
      },
    });
  }
  return ret;
}
