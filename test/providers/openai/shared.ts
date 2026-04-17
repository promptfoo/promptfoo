export function getOpenAiMissingApiKeyMessage(envVar = 'OPENAI_API_KEY'): string {
  return `API key is not set. Set the ${envVar} environment variable or add \`apiKey\` to the provider config.`;
}

export function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
