/**
 * Utilities for multi-input format handling.
 * Used by both plugin base class and cloud harmful generation.
 */

import dedent from 'dedent';
import logger from '../../logger';
import { buildInputPromptDescription, type Inputs } from '../../types/shared';
import { extractAllPromptsFromTags, removePrefix } from '../util';

export type InputsSchema = Inputs;

/**
 * Build a schema description string from inputs config.
 * @example buildSchemaString({ message: "user message", context: "additional context" })
 * // Returns: '"message": "user message", "context": "additional context"'
 */
export function buildSchemaString(inputs: InputsSchema): string {
  return Object.entries(inputs)
    .map(([key, definition]) => `"${key}": "${buildInputPromptDescription(definition)}"`)
    .join(', ');
}

/**
 * Get the list of input keys from the inputs config.
 */
export function getInputKeys(inputs: InputsSchema): string[] {
  return Object.keys(inputs);
}

/**
 * Check if config has multi-input mode enabled.
 */
export function hasMultiInput(inputs?: InputsSchema): inputs is InputsSchema {
  return inputs !== undefined && Object.keys(inputs).length > 0;
}

/**
 * Build a JSON format example string for multi-input.
 * @example buildFormatExample({ message: "desc", context: "desc" })
 * // Returns: '{"message": "content", "context": "value"}'
 */
export function buildFormatExample(inputs: InputsSchema): string {
  const keys = getInputKeys(inputs);
  if (keys.length === 0) {
    return '{}';
  }

  const parts = keys.map((key, i) => {
    const value = i === 0 ? 'content' : 'value';
    return `"${key}": "${value}"`;
  });
  return `{${parts.join(', ')}}`;
}

/**
 * Checks if a line contains a prompt marker (e.g., "Prompt:" or "Prompt :" for French typography).
 * @param line - The line to check
 * @returns True if the line contains a prompt marker
 */
function hasPromptMarker(line: string): boolean {
  // Match "prompt" followed by optional whitespace and colon
  return /prompt\s*:/i.test(line);
}

function parsePromptBlocks(generatedPrompts: string): { __prompt: string }[] {
  return generatedPrompts
    .split('PromptBlock:')
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => ({ __prompt: block }));
}

function getPromptLineIndices(lines: string[]): number[] {
  return lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => hasPromptMarker(line))
    .map(({ index }) => index);
}

function hasMultilinePromptSections(lines: string[], promptLineIndices: number[]): boolean {
  if (promptLineIndices.length <= 1) {
    return false;
  }

  return promptLineIndices.some((promptIndex, index) => {
    const nextPromptIndex =
      index < promptLineIndices.length - 1 ? promptLineIndices[index + 1] : lines.length;

    let consecutiveContentLines = 0;
    for (let lineIndex = promptIndex + 1; lineIndex < nextPromptIndex; lineIndex++) {
      const line = lines[lineIndex].trim();
      if (line.length === 0 || hasPromptMarker(line)) {
        break;
      }
      consecutiveContentLines++;
    }

    return consecutiveContentLines >= 2;
  });
}

function cleanParsedPrompt(prompt: string): { __prompt: string } {
  return {
    __prompt: prompt.replace(/^\*+\s*/, '').replace(/\s*\*+$/, ''),
  };
}

function parseMultilinePrompts(lines: string[]): { __prompt: string }[] {
  const prompts: string[] = [];
  let currentPrompt = '';
  let inPrompt = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (hasPromptMarker(trimmedLine)) {
      if (inPrompt && currentPrompt.trim().length > 0) {
        prompts.push(currentPrompt.trim());
      }
      currentPrompt = removePrefix(trimmedLine, 'Prompt');
      inPrompt = true;
      continue;
    }

    if (inPrompt && (currentPrompt || trimmedLine)) {
      currentPrompt += (currentPrompt ? '\n' : '') + line;
    }
  }

  if (inPrompt && currentPrompt.trim().length > 0) {
    prompts.push(currentPrompt.trim());
  }

  return prompts.filter((prompt) => prompt.length > 0).map(cleanParsedPrompt);
}

function parseLegacyPrompt(line: string): string | null {
  if (!hasPromptMarker(line)) {
    return null;
  }

  let prompt = removePrefix(line, 'Prompt');
  prompt = prompt.replace(/^\d+[\.\)\-]?\s*-?\s*/, '');
  prompt = prompt.replace(/^["'](.*)["']$/, '$1');
  prompt = prompt.replace(/^'([^']*(?:'{2}[^']*)*)'$/, (_, p1) => p1.replace(/''/g, "'"));
  prompt = prompt.replace(/^"([^"]*(?:"{2}[^"]*)*)"$/, (_, p1) => p1.replace(/""/g, '"'));
  prompt = prompt.replace(/^\*+/, '').replace(/\*$/, '');
  return prompt.trim();
}

function parseLegacyPrompts(generatedPrompts: string): { __prompt: string }[] {
  return generatedPrompts
    .split(/[\n;]+/)
    .map(parseLegacyPrompt)
    .filter((prompt): prompt is string => prompt !== null)
    .map((prompt) => ({ __prompt: prompt }));
}

/**
 * Parses the LLM response of generated prompts into an array of objects.
 * Handles prompts with "Prompt:" or "PromptBlock:" markers.
 *
 * @param generatedPrompts - The LLM response of generated prompts.
 * @returns An array of { __prompt: string } objects. Each of these objects represents a test case.
 */
export function parseGeneratedPrompts(generatedPrompts: string): { __prompt: string }[] {
  if (generatedPrompts.includes('PromptBlock:')) {
    return parsePromptBlocks(generatedPrompts);
  }

  const lines = generatedPrompts.split('\n');
  const promptLineIndices = getPromptLineIndices(lines);
  if (hasMultilinePromptSections(lines, promptLineIndices)) {
    return parseMultilinePrompts(lines);
  }

  return parseLegacyPrompts(generatedPrompts);
}

/**
 * Parses LLM output into multi-input test cases when inputs schema is defined.
 * Extracts JSON from <Prompt> tags and returns them as prompt strings.
 *
 * @param generatedOutput - The LLM response containing generated test cases.
 * @param inputs - The inputs schema defining expected variable names.
 * @returns An array of { __prompt: string } objects where __prompt is the JSON string.
 */
export function parseGeneratedInputs(
  generatedOutput: string,
  inputs: Inputs,
): { __prompt: string }[] {
  const results: { __prompt: string }[] = [];
  const inputKeys = Object.keys(inputs);

  // Extract JSON from <Prompt> tags
  const promptStrings = extractAllPromptsFromTags(generatedOutput);

  for (const jsonStr of promptStrings) {
    try {
      const parsed = JSON.parse(jsonStr);

      // Validate all required keys exist
      const hasAllKeys = inputKeys.every((key) => key in parsed);
      if (hasAllKeys) {
        // Return the JSON string as the prompt value
        results.push({ __prompt: jsonStr });
      }
    } catch {
      logger.debug(`Failed to parse JSON from <Prompt> tag: ${jsonStr}`);
    }
  }

  // Fallback: allow bare JSON object/array when tags are missing
  if (results.length === 0) {
    try {
      const parsed = JSON.parse(generatedOutput);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (item && typeof item === 'object') {
            const hasAllKeys = inputKeys.every((key) => key in item);
            if (hasAllKeys) {
              results.push({ __prompt: JSON.stringify(item) });
            }
          }
        });
      } else if (parsed && typeof parsed === 'object') {
        const hasAllKeys = inputKeys.every((key) => key in parsed);
        if (hasAllKeys) {
          results.push({ __prompt: JSON.stringify(parsed) });
        }
      }
    } catch {
      // ignore
    }
  }

  return results;
}

/**
 * Output formatter type - pairs instruction generation with output parsing.
 */
export type PromptOutputFormatterConfig = {
  inputs?: InputsSchema;
};

export type PromptOutputFormatter = {
  instruction: (config: PromptOutputFormatterConfig) => string;
  parse: (output: string, config: PromptOutputFormatterConfig) => { __prompt: string }[];
};

/**
 * Built-in formatters for different output modes.
 */
const PROMPT_OUTPUT_FORMATTERS: Record<string, PromptOutputFormatter> = {
  'single-input': {
    instruction: () => 'Each line must begin with the string "Prompt:"',
    parse: (output) => parseGeneratedPrompts(output),
  },
  'multi-input': {
    instruction: (config) => {
      const inputKeys = getInputKeys(config.inputs!);
      const schema = buildSchemaString(config.inputs!);
      return dedent`
        OUTPUT FORMAT: Each test case must be a JSON object wrapped in <Prompt> tags.
        Required keys: ${inputKeys.map((k) => `"${k}"`).join(', ')}
        Format: <Prompt>${buildFormatExample(config.inputs!)}</Prompt>
        Schema: {${schema}}
      `;
    },
    parse: (output, config) => parseGeneratedInputs(output, config.inputs!),
  },
};

/**
 * Get the appropriate formatter based on config.
 */
export function getPromptOutputFormatter(
  config: PromptOutputFormatterConfig,
): PromptOutputFormatter {
  if (hasMultiInput(config.inputs)) {
    return PROMPT_OUTPUT_FORMATTERS['multi-input'];
  }
  return PROMPT_OUTPUT_FORMATTERS['single-input'];
}

export type JsonArrayOutputFormatterConfig = {
  inputs?: InputsSchema;
};

export type JsonArrayOutputFormatter = {
  instruction: (n: number, config?: JsonArrayOutputFormatterConfig) => string;
  parse: (output: unknown[]) => string[];
};

const JSON_ARRAY_OUTPUT_FORMATTERS: Record<string, JsonArrayOutputFormatter> = {
  'single-input': {
    instruction: (n) =>
      `**Always generate ${n} outputs**, returned as a **JSON array of strings**, with no extra commentary.`,
    parse: (output) => output.map((item) => (typeof item === 'string' ? item : String(item))),
  },
  'multi-input': {
    instruction: (n, config) => {
      const inputs = config?.inputs ?? {};
      const inputKeys = getInputKeys(inputs);
      const schema = buildSchemaString(inputs);
      return `**Always generate ${n} outputs**, returned as a **JSON array of objects**.
Each object must have these keys: ${inputKeys.map((k) => `"${k}"`).join(', ')}
Format: [{"${inputKeys[0]}": "adversarial content for ${inputKeys[0]}", ${inputKeys
        .slice(1)
        .map((k) => `"${k}": "value for ${k}"`)
        .join(', ')}}, ...]
Schema: {${schema}}
No extra commentary.`;
    },
    parse: (output) =>
      output.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))),
  },
};

export function getJsonArrayOutputFormatter(
  config?: JsonArrayOutputFormatterConfig,
): JsonArrayOutputFormatter {
  if (hasMultiInput(config?.inputs)) {
    return JSON_ARRAY_OUTPUT_FORMATTERS['multi-input'];
  }
  return JSON_ARRAY_OUTPUT_FORMATTERS['single-input'];
}
