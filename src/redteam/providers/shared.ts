import logger from '../../logger';
import { loadApiProviders } from '../../providers';
import { OpenAiChatCompletionProvider } from '../../providers/openai';
import { isProviderOptions, isApiProvider, type RedteamConfig } from '../../types';
import { ATTACKER_MODEL, TEMPERATURE } from './constants';

export async function loadRedteamProvider(
  redteamProvider: RedteamConfig['provider'],
  defaultModel: string = ATTACKER_MODEL,
) {
  let ret;
  if (isApiProvider(redteamProvider)) {
    logger.debug(`Using redteam provider: ${redteamProvider}`);
    ret = redteamProvider;
  } else if (typeof redteamProvider === 'string' || isProviderOptions(redteamProvider)) {
    logger.debug(`Loading redteam provider: ${redteamProvider}`);
    ret = (await loadApiProviders([redteamProvider]))[0];
  } else {
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
