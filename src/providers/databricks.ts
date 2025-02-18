import { getEnvString } from '../envars';
import type { ProviderOptions } from '../types/providers';
import { OpenAiChatCompletionProvider } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

type DatabricksMosaicAiCompletionOptions = OpenAiCompletionOptions & {
  workspaceUrl?: string;
};

export type DatabricksMosaicAiProviderOptions = ProviderOptions & {
  config: DatabricksMosaicAiCompletionOptions;
};

// https://docs.databricks.com/en/large-language-models/llm-serving-intro.html#get-started-using-foundation-model-apis
export class DatabricksMosaicAiChatCompletionProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: DatabricksMosaicAiProviderOptions) {
    const workspaceUrl =
      providerOptions.config?.workspaceUrl || getEnvString('DATABRICKS_WORKSPACE_URL');

    if (!workspaceUrl) {
      throw new Error(
        'Databricks workspace URL is required. Set it in the config or DATABRICKS_WORKSPACE_URL environment variable.',
      );
    }

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'DATABRICKS_TOKEN',
        apiBaseUrl: `${workspaceUrl}/serving-endpoints`,
      },
    });
  }
}
