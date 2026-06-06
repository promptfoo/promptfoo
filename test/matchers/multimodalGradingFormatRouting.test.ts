import { describe, expect, it } from 'vitest';
import { matchesLlmRubric } from '../../src/matchers/llmGrading';
import { createMockProvider } from '../factories/provider';

// Key-free verification that every default-grader provider family routes image outputs
// to the multimodal shape its API accepts. Misrouting (e.g. sending OpenAI image_url to
// a provider that can't parse it) is the failure mode that broke Bedrock Nova, so this
// pins the routing for each default grader from src/providers/defaults.ts.
describe('multimodal grading: format routing per default grader', () => {
  const dataUri = 'data:image/png;base64,aGVsbG8=';

  const openaiImagePart = { type: 'image_url', image_url: { url: dataUri } };
  const responsesImagePart = { type: 'input_image', image_url: dataUri };
  const anthropicImagePart = {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' },
  };
  const googleImagePart = { inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } };

  // [provider id (as resolved by the default grader for each vendor), expected image part]
  const cases: Array<[string, Record<string, unknown>]> = [
    // OpenAI default + OpenAI-compatible vendors (Azure, Mistral, GitHub Models) -> chat image_url
    ['openai:gpt-4o-mini', openaiImagePart],
    ['azure:gpt-4o', openaiImagePart],
    ['mistral:mistral-small-latest', openaiImagePart],
    ['github:gpt-4o', openaiImagePart],
    ['openrouter:x-ai/grok-2-vision-1212', openaiImagePart],
    // Responses-API vendors (xAI default is xai:responses:grok-4.3) -> input_image
    ['xai:responses:grok-4.3', responsesImagePart],
    ['openai:responses:gpt-4o-mini', responsesImagePart],
    // Anthropic (direct + Bedrock Claude + Vertex Claude) -> base64 image block
    ['anthropic:messages:claude-haiku-4-5', anthropicImagePart],
    ['bedrock:us.anthropic.claude-haiku-4-5-20251001-v1:0', anthropicImagePart],
    ['vertex:claude-haiku-4-5@20251001', anthropicImagePart],
    // Google (AI Studio + Vertex Gemini) -> inlineData
    ['google:gemini-2.5-flash', googleImagePart],
    ['vertex:gemini-2.5-flash', googleImagePart],
    // Bedrock Nova falls through to openai image_url; the Bedrock provider translates it
    // to Nova bytes blocks (see src/providers/bedrock/util.ts).
    ['bedrock:amazon.nova-lite-v1:0', openaiImagePart],
  ];

  it.each(cases)('routes %s to the correct multimodal format', async (graderId, expectedPart) => {
    const provider = createMockProvider({
      id: graderId,
      response: { output: JSON.stringify({ pass: true, score: 1, reason: 'ok' }) },
    });

    await matchesLlmRubric(
      'Does the image match?',
      'Generated image',
      { rubricPrompt: 'Grade this output: {{ output }}', provider },
      {},
      undefined,
      { providerResponse: { output: 'Generated image', images: [{ data: dataUri }] } },
    );

    const prompt = provider.callApi.mock.calls[0][0] as string;
    const messages = JSON.parse(prompt);
    const lastUser = [...messages].reverse().find((m: { role?: string }) => m.role === 'user');
    const imagePart = lastUser.content.at(-1);
    expect(imagePart).toEqual(expectedPart);
  });
});
