import { SimulatedUser } from '../../providers/simulatedUser';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types';
import invariant from '../../util/invariant';

export default class RedteamTauProvider implements ApiProvider {
  private readonly injectVar: string;
  private readonly maxTurns?: number;
  private readonly userProvider?: ProviderOptions;

  constructor(config: ProviderOptions['config'] & { injectVar: string }) {
    invariant(config.injectVar, 'Expected injectVar to be set');
    this.injectVar = config.injectVar;
    this.maxTurns = config.maxTurns as number | undefined;
    this.userProvider = config.userProvider as ProviderOptions | undefined;
  }

  id() {
    return 'promptfoo:redteam:tau';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const provider = new SimulatedUser({
      id: this.id(),
      config: {
        instructions: `{{${this.injectVar}}}`,
        maxTurns: this.maxTurns,
        userProvider: this.userProvider,
      },
    });
    return provider.callApi(prompt, context, options);
  }
}
