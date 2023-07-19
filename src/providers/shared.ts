import yaml from 'js-yaml';

export const REQUEST_TIMEOUT_MS = process.env.REQUEST_TIMEOUT_MS
  ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
  : 300_000;

export function parsePrompt(prompt: string): { role: string; content: string; name?: string }[] {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.startsWith('- role:')) {
    try {
      // Try YAML
      return yaml.load(prompt) as { role: string; content: string }[];
    } catch (err) {
      throw new Error(`Chat Completion prompt is not a valid YAML string: ${err}\n\n${prompt}`);
    }
  } else {
    try {
      // Try JSON
      return JSON.parse(prompt) as { role: string; content: string }[];
    } catch (err) {
      if (
        process.env.PROMPTFOO_REQUIRE_JSON_PROMPTS ||
        trimmedPrompt.startsWith('{') ||
        trimmedPrompt.startsWith('[')
      ) {
        throw new Error(`Chat Completion prompt is not a valid JSON string: ${err}\n\n${prompt}`);
      }
      // Fall back to wrapping the prompt in a user message
      return [{ role: 'user', content: prompt }];
    }
  }
}
