import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import cliState from '../cliState';

export const REQUEST_TIMEOUT_MS = process.env.REQUEST_TIMEOUT_MS
  ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
  : 300_000;

export function parseChatPrompt<T>(prompt: string, defaultValue: T): T {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.startsWith('- role:')) {
    try {
      // Try YAML - some legacy OpenAI prompts are YAML :(
      return yaml.load(prompt) as T;
    } catch (err) {
      throw new Error(`Chat Completion prompt is not a valid YAML string: ${err}\n\n${prompt}`);
    }
  } else {
    try {
      // Try JSON
      return JSON.parse(prompt) as T;
    } catch (err) {
      if (
        process.env.PROMPTFOO_REQUIRE_JSON_PROMPTS ||
        trimmedPrompt.startsWith('{') ||
        trimmedPrompt.startsWith('[')
      ) {
        throw new Error(`Chat Completion prompt is not a valid JSON string: ${err}\n\n${prompt}`);
      }
      // Fall back to the provided default value
      return defaultValue;
    }
  }
}

export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export function maybeLoadFromExternalFile(filePath: string | object | Function | undefined | null) {
  if (typeof filePath !== 'string') {
    return filePath;
  }
  if (!filePath.startsWith('file://')) {
    return filePath;
  }

  const finalPath = path.resolve(cliState.basePath || '', filePath.slice('file://'.length));
  if (!fs.existsSync(finalPath)) {
    throw new Error(`File does not exist: ${finalPath}`);
  }

  const contents = fs.readFileSync(finalPath, 'utf8');
  if (finalPath.endsWith('.json')) {
    return JSON.parse(contents);
  }
  if (finalPath.endsWith('.yaml') || finalPath.endsWith('.yml')) {
    return yaml.load(contents);
  }
  return contents;
}
