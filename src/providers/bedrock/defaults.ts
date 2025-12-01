import { AwsBedrockConverseProvider } from './converse';

// Default model for Bedrock grading - Nova Pro offers good balance of capability and cost
// No special agreement required (unlike Anthropic models on Bedrock)
export const DEFAULT_BEDROCK_MODEL = 'amazon.nova-pro-v1:0';

export const DefaultGradingProvider = new AwsBedrockConverseProvider(DEFAULT_BEDROCK_MODEL);

export const DefaultGradingJsonProvider = new AwsBedrockConverseProvider(DEFAULT_BEDROCK_MODEL, {
  config: {
    additionalModelRequestFields: {
      inferenceConfig: {
        // Nova models support JSON output via system prompt, not response_format
      },
    },
  },
});

export const DefaultSuggestionsProvider = new AwsBedrockConverseProvider(DEFAULT_BEDROCK_MODEL);

export const DefaultSynthesizeProvider = new AwsBedrockConverseProvider(DEFAULT_BEDROCK_MODEL);
