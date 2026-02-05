/**
 * Utilities for multi-input format handling.
 * Used by both plugin base class and cloud harmful generation.
 */

import dedent from 'dedent';
import logger from '../../logger';
import { extractAllPromptsFromTags, removePrefix } from '../util';

export type InputsSchema = Record<string, string>;

/**
 * Build a schema description string from inputs config.
 * @example buildSchemaString({ message: "user message", context: "additional context" })
 * // Returns: '"message": "user message", "context": "additional context"'
 */
export function buildSchemaString(inputs: InputsSchema): string {
  return Object.entries(inputs)
    .map(([key, description]) => `"${key}": "${description}"`)
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

/**
 * Parses the LLM response of generated prompts into an array of objects.
 * Handles prompts with "Prompt:" or "PromptBlock:" markers.
 *
 * @param generatedPrompts - The LLM response of generated prompts.
 * @returns An array of { __prompt: string } objects. Each of these objects represents a test case.
 */
export function parseGeneratedPrompts(generatedPrompts: string): { __prompt: string }[] {
  // Try PromptBlock: first (for multi-line content)
  if (generatedPrompts.includes('PromptBlock:')) {
    return generatedPrompts
      .split('PromptBlock:')
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .map((block) => ({ __prompt: block }));
  }

  // Check if we have multi-line prompts (multiple "Prompt:" with content spanning multiple lines)
  // This is detected by having "Prompt:" followed by multiple consecutive content lines
  const lines = generatedPrompts.split('\n');
  const promptLineIndices = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => hasPromptMarker(line)) // Match "Prompt:" or "Prompt :" (French typography)
    .map(({ index }) => index);

  // If we have multiple "Prompt:" markers, check if any prompt has multiple content lines
  if (promptLineIndices.length > 1) {
    const hasMultiLinePrompts = promptLineIndices.some((promptIndex, i) => {
      const nextPromptIndex =
        i < promptLineIndices.length - 1 ? promptLineIndices[i + 1] : lines.length;

      // Count consecutive non-empty lines after this prompt
      let consecutiveContentLines = 0;
      for (let j = promptIndex + 1; j < nextPromptIndex; j++) {
        const line = lines[j].trim();
        if (line.length > 0 && !hasPromptMarker(line)) {
          consecutiveContentLines++;
        } else {
          break; // Stop at empty line or another prompt line
        }
      }

      // Multi-line if we have 2+ consecutive content lines after a Prompt:
      return consecutiveContentLines >= 2;
    });

    if (hasMultiLinePrompts) {
      const prompts: string[] = [];
      let currentPrompt = '';
      let inPrompt = false;

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Check if this line contains a prompt marker
        if (hasPromptMarker(trimmedLine)) {
          // Save the previous prompt if it exists and is not empty
          if (inPrompt && currentPrompt.trim().length > 0) {
            prompts.push(currentPrompt.trim());
          }
          // Start new prompt, removing the "Prompt:" prefix using the same logic as legacy
          currentPrompt = removePrefix(trimmedLine, 'Prompt');
          inPrompt = true;
        } else if (inPrompt) {
          // Add line to current prompt only if we're inside a prompt
          if (currentPrompt || trimmedLine) {
            currentPrompt += (currentPrompt ? '\n' : '') + line;
          }
        }
      }

      // Don't forget the last prompt
      if (inPrompt && currentPrompt.trim().length > 0) {
        prompts.push(currentPrompt.trim());
      }

      return prompts
        .filter((prompt) => prompt.length > 0)
        .map((prompt) => {
          // Strip leading/trailing asterisks for backward compatibility
          const cleanedPrompt = prompt.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '');
          return { __prompt: cleanedPrompt };
        });
    }
  }

  // Legacy parsing for backwards compatibility (single-line prompts)
  const parsePrompt = (line: string): string | null => {
    if (!hasPromptMarker(line)) {
      return null;
    }
    let prompt = removePrefix(line, 'Prompt');
    // Handle numbered lists with various formats
    prompt = prompt.replace(/^\d+[\.\)\-]?\s*-?\s*/, '');
    // Handle quotes
    prompt = prompt.replace(/^["'](.*)["']$/, '$1');
    // Handle nested quotes
    prompt = prompt.replace(/^'([^']*(?:'{2}[^']*)*)'$/, (_, p1) => p1.replace(/''/g, "'"));
    prompt = prompt.replace(/^"([^"]*(?:"{2}[^"]*)*)"$/, (_, p1) => p1.replace(/""/g, '"'));
    // Strip leading and trailing asterisks
    prompt = prompt.replace(/^\*+/, '').replace(/\*$/, '');
    return prompt.trim();
  };

  // Split by newline or semicolon
  const promptLines = generatedPrompts.split(/[\n;]+/);

  return promptLines
    .map(parsePrompt)
    .filter((prompt): prompt is string => prompt !== null)
    .map((prompt) => ({ __prompt: prompt }));
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
  inputs: Record<string, string>,
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
              results.push({ __prompt: `<Prompt>${JSON.stringify(item)}</Prompt>` });
            }
          }
        });
      } else if (parsed && typeof parsed === 'object') {
        const hasAllKeys = inputKeys.every((key) => key in parsed);
        if (hasAllKeys) {
          results.push({ __prompt: `<Prompt>${JSON.stringify(parsed)}</Prompt>` });
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
