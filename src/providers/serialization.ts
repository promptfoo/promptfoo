export function serializeProvider<Config extends { apiKey?: string }>(
  provider: { modelName: string; config: Config },
  name: string,
  getApiKey: () => string | undefined = () => provider.config.apiKey,
): { provider: string; model: string; config: { -readonly [Key in keyof Config]: Config[Key] } } {
  return {
    provider: name,
    model: provider.modelName,
    config: {
      ...provider.config,
      ...(getApiKey() && { apiKey: undefined }),
    },
  };
}
