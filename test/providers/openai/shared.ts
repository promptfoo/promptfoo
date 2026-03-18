export function getOpenAiMissingApiKeyMessage(envVar = 'OPENAI_API_KEY'): string {
  return `API key is not set. Set the ${envVar} environment variable or add \`apiKey\` to the provider config.`;
}
