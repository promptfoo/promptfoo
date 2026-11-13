// The Terra and Luna cards list the same GovCloud rates for Mantle In-Region and Runtime Geo CRIS.
// https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-terra.html
// https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-luna.html
export function getBedrockGovCloudTextRates(model: string, inputTokens: number) {
  const inputPerMillion =
    model === 'gpt-5.6-terra' ? 2.7 : model === 'gpt-5.6-luna' ? 0.27 : undefined;
  if (inputPerMillion === undefined) {
    return undefined;
  }
  const long = inputTokens > 272_000;
  const input = (inputPerMillion * (long ? 2 : 1)) / 1e6;
  return {
    input,
    cachedInput: input * 0.1,
    cacheWriteInput: input * 1.25,
    output: (inputPerMillion * (long ? 9 : 6)) / 1e6,
  };
}
