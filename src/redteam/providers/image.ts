import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import type { ImageStrategyConfig } from '../strategies/image';

interface ImageResponse {
  base64Image: string;
  task: 'redteam:image';
}

export default class ImageProvider implements ApiProvider {
  private readonly injectVar: string;
  private readonly imageConfig?: ImageStrategyConfig;

  id() {
    return 'promptfoo:redteam:image';
  }

  constructor(
    options: ProviderOptions & {
      injectVar?: string;
      imageConfig?: ImageStrategyConfig;
    } = {},
  ) {
    if (neverGenerateRemote()) {
      throw new Error(`Image strategy requires remote generation to be enabled`);
    }

    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.injectVar = options.injectVar;
    this.imageConfig = options.imageConfig;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    logger.debug(`[Image] callApi context: ${safeJsonStringify(context)}`);
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider = context.originalProvider;

    try {
      const originalText = String(context.vars[this.injectVar]);

      // Get image from the server
      const response = await fetch(getRemoteGenerationUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: 'redteam:image',
          text: originalText,
          config: this.imageConfig,
          version: VERSION,
          email: getUserEmail(),
        }),
      });

      const data = (await response.json()) as ImageResponse;
      invariant(typeof data.base64Image === 'string', 'Expected base64Image string in response');

      logger.debug(`[Image] Generated base64 image (length: ${data.base64Image.length})`);

      // Update vars with the base64 image
      const targetVars = {
        ...context.vars,
        [this.injectVar]: data.base64Image,
        image_text: originalText,
      };

      const renderedPrompt = await renderPrompt(
        context.prompt,
        targetVars,
        context.filters,
        targetProvider,
      );

      // Call the target provider with the image-encoded prompt
      const providerResponse = await targetProvider.callApi(renderedPrompt, context, options);

      return {
        ...providerResponse,
        metadata: {
          ...providerResponse.metadata,
          redteamImageEncoded: true,
          redteamOriginalText: originalText,
        },
      };
    } catch (err) {
      logger.error(`[Image] Error: ${err}`);
      return {
        error: String(err),
      };
    }
  }
}
