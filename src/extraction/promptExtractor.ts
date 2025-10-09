import * as fs from 'fs';
import * as path from 'path';
import dedent from 'dedent';
import logger from '../logger';
import type { ApiProvider } from '../types';
import type { ExtractedPrompt } from './types';
import { detectVariables } from './variableDetector';

interface LLMExtractedPrompt {
  content: string;
  line?: number;
  role?: 'system' | 'user' | 'assistant';
  apiProvider?: string;
  confidence: number;
  reasoning?: string;
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    isVariable?: boolean;
    variableName?: string;
  }>;
  type?: 'single' | 'composed';
}

/**
 * Extract prompts from a source file using an LLM
 */
export async function extractPromptsFromFile(
  filePath: string,
  provider: ApiProvider,
  minConfidence = 0.6,
): Promise<ExtractedPrompt[]> {
  logger.debug(`[promptExtractor] Extracting prompts from ${filePath} using LLM`);

  // Read file content
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf-8');
  } catch (error) {
    logger.error(`[promptExtractor] Failed to read file ${filePath}`, { error });
    throw new Error(`Failed to read file: ${error instanceof Error ? error.message : error}`);
  }

  // Get file extension for context
  const ext = path.extname(filePath);
  const language = getLanguageFromExtension(ext);

  // Use LLM to extract prompts
  const prompt = dedent`
    Extract prompts being sent to LLM APIs from this ${language} code.

    TASK:
    1. Find where LLM APIs are called (OpenAI, Anthropic, etc.)
    2. Look at the message content being sent
    3. If content references a variable, trace back to find that variable's definition
    4. Extract the actual prompt text, replacing dynamic parts with {{variableName}}

    RULES:
    - When you see "content: someVar", find where someVar is defined
    - For template literals like \`Hello \${name}\`, extract as "Hello {{name}}"
    - For variables built from other variables (e.g., contextString from map/join), mark as {{contextString}}
    - Include all static text - this is the actual prompt being sent to the LLM
    - Ignore conditional logic (||, ??) - extract the template, not the fallback value

    OUTPUT FORMAT:
    Return a JSON array. Each extracted prompt should have:
    {
      "content": "The actual prompt text with {{variables}}",
      "line": <line number>,
      "role": "system" | "user" | "assistant",
      "apiProvider": "openai" | "anthropic" | etc,
      "confidence": 0.0-1.0,
      "reasoning": "Brief explanation"
    }

    EXAMPLE:
    Code:
    \`\`\`
    const greeting = \`Hello \${name}, welcome!\`;
    const messages = [{role: 'user', content: greeting}];
    await openai.chat.completions.create({messages});
    \`\`\`

    Extract:
    [{
      "content": "Hello {{name}}, welcome!",
      "line": 1,
      "role": "user",
      "apiProvider": "openai",
      "confidence": 0.95,
      "reasoning": "Template literal prompt with dynamic name variable"
    }]

    Return ONLY valid JSON array. No markdown, no explanations.
    If no prompts found, return: []

    Code to analyze:
    \`\`\`${language}
    ${content}
    \`\`\`

    JSON array:
  `;

  let llmPrompts: LLMExtractedPrompt[];
  try {
    const { output, error } = await provider.callApi(
      JSON.stringify([{ role: 'user', content: prompt }]),
    );

    if (error) {
      throw new Error(`LLM API error: ${error}`);
    }

    if (typeof output !== 'string') {
      throw new Error(`Invalid output type: ${typeof output}`);
    }

    logger.debug(`[promptExtractor] Raw LLM output (first 500 chars)`, {
      output: output.substring(0, 500),
    });

    // Try to parse JSON from the output
    // Sometimes LLMs wrap JSON in markdown code blocks
    let jsonStr = output.trim();

    // Remove markdown code blocks if present
    // Use greedy match to handle nested code blocks in JSON content
    if (jsonStr.startsWith('```')) {
      const firstNewline = jsonStr.indexOf('\n');
      const lastBacktick = jsonStr.lastIndexOf('```');
      if (firstNewline !== -1 && lastBacktick > firstNewline) {
        jsonStr = jsonStr.substring(firstNewline + 1, lastBacktick).trim();
        logger.debug('[promptExtractor] Extracted JSON from code block');
      }
    }

    // Try to fix common JSON issues
    // Remove trailing commas before closing brackets
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

    // Remove comments (// or /* */)
    jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
    jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');

    // Parse the JSON
    let parsedOutput: any;
    try {
      parsedOutput = JSON.parse(jsonStr);
    } catch (parseError) {
      logger.error('[promptExtractor] JSON parse error', {
        error: parseError,
        jsonPreview: jsonStr.substring(0, 500),
      });

      // Try to extract just the array if there's extra text
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        logger.debug('[promptExtractor] Attempting to extract array from response');
        try {
          parsedOutput = JSON.parse(arrayMatch[0]);
          logger.debug('[promptExtractor] Successfully extracted array');
        } catch (_secondError) {
          throw new Error(
            `Failed to parse JSON: ${parseError instanceof Error ? parseError.message : parseError}`,
          );
        }
      } else {
        throw new Error(
          `Failed to parse JSON: ${parseError instanceof Error ? parseError.message : parseError}`,
        );
      }
    }

    // Handle both array and single object responses
    if (Array.isArray(parsedOutput)) {
      llmPrompts = parsedOutput;
    } else if (typeof parsedOutput === 'object' && parsedOutput !== null) {
      // Check if the LLM wrapped the array in an object (e.g., {"result": [...]})
      // This happens with response_format: {type: "json_object"}
      if ('result' in parsedOutput && Array.isArray(parsedOutput.result)) {
        logger.debug('[promptExtractor] Unwrapping result array from object');
        llmPrompts = parsedOutput.result;
      } else if ('prompts' in parsedOutput && Array.isArray(parsedOutput.prompts)) {
        logger.debug('[promptExtractor] Unwrapping prompts array from object');
        llmPrompts = parsedOutput.prompts;
      } else if ('data' in parsedOutput && Array.isArray(parsedOutput.data)) {
        logger.debug('[promptExtractor] Unwrapping data array from object');
        llmPrompts = parsedOutput.data;
      } else {
        // LLM returned a single prompt object (not wrapped) - wrap it
        logger.debug('[promptExtractor] LLM returned single object, wrapping in array');
        llmPrompts = [parsedOutput];
      }
    } else {
      throw new Error(`LLM output is neither an array nor an object: ${typeof parsedOutput}`);
    }

    logger.debug(`[promptExtractor] LLM extracted ${llmPrompts.length} candidate prompts`);
  } catch (error) {
    logger.error(`[promptExtractor] Failed to extract prompts using LLM`, { error });
    throw new Error(`Failed to extract prompts: ${error instanceof Error ? error.message : error}`);
  }

  // Convert LLM output to ExtractedPrompt format
  const lines = content.split('\n');
  const extractedPrompts: ExtractedPrompt[] = [];

  for (const llmPrompt of llmPrompts) {
    // Validate that this looks like a valid prompt object
    if (!llmPrompt || typeof llmPrompt !== 'object') {
      logger.warn('[promptExtractor] Skipping invalid prompt object (not an object)', {
        prompt: llmPrompt,
      });
      continue;
    }

    // Skip if missing required fields
    if (!llmPrompt.content || typeof llmPrompt.content !== 'string') {
      logger.warn('[promptExtractor] Skipping invalid prompt object (missing content)', {
        prompt: llmPrompt,
      });
      continue;
    }

    if (typeof llmPrompt.confidence !== 'number') {
      logger.warn('[promptExtractor] Skipping invalid prompt object (missing confidence)', {
        prompt: llmPrompt,
      });
      continue;
    }

    // Skip if below confidence threshold
    if (llmPrompt.confidence < minConfidence) {
      logger.debug(`[promptExtractor] Skipping low confidence prompt`, {
        confidence: llmPrompt.confidence,
        minConfidence,
      });
      continue;
    }

    // Get context around the line
    const lineNumber = llmPrompt.line || 1;
    const contextStart = Math.max(0, lineNumber - 2);
    const contextEnd = Math.min(lines.length, lineNumber + 2);
    const context = lines.slice(contextStart, contextEnd).join('\n');

    // Handle composed prompts differently
    if (llmPrompt.type === 'composed' && llmPrompt.messages) {
      // For composed prompts, detect variables across all messages
      const allVariables = new Set<string>();
      for (const msg of llmPrompt.messages) {
        const vars = detectVariables(msg.content);
        for (const v of vars) {
          allVariables.add(v.name);
        }
        // Also add variable names from isVariable flags
        if (msg.isVariable && msg.variableName) {
          allVariables.add(msg.variableName);
        }
      }

      // Convert to Variable objects
      const variables = Array.from(allVariables).map((name) => ({
        name,
        syntax: `{{${name}}}`,
        syntaxType: 'mustache' as const,
      }));

      extractedPrompts.push({
        content: llmPrompt.content,
        variables,
        location: {
          file: filePath,
          line: lineNumber,
          context,
        },
        confidence: llmPrompt.confidence,
        apiProvider: llmPrompt.apiProvider,
        role: llmPrompt.role,
        messages: llmPrompt.messages,
        type: 'composed',
      });

      logger.debug(`[promptExtractor] Extracted composed prompt`, {
        line: lineNumber,
        confidence: llmPrompt.confidence,
        messageCount: llmPrompt.messages.length,
        variableCount: variables.length,
        apiProvider: llmPrompt.apiProvider,
      });
    } else {
      // Single prompt - existing logic
      const variables = detectVariables(llmPrompt.content);

      extractedPrompts.push({
        content: llmPrompt.content,
        variables,
        location: {
          file: filePath,
          line: lineNumber,
          context,
        },
        confidence: llmPrompt.confidence,
        apiProvider: llmPrompt.apiProvider,
        role: llmPrompt.role,
        type: 'single',
      });

      logger.debug(`[promptExtractor] Extracted single prompt`, {
        line: lineNumber,
        confidence: llmPrompt.confidence,
        variableCount: variables.length,
        apiProvider: llmPrompt.apiProvider,
        role: llmPrompt.role,
      });
    }
  }

  logger.info(`[promptExtractor] Extracted ${extractedPrompts.length} prompts from ${filePath}`);

  return extractedPrompts;
}

/**
 * Extract prompts from raw content using an LLM
 */
export async function extractPromptsFromContent(
  content: string,
  filePath: string,
  provider: ApiProvider,
  minConfidence = 0.6,
): Promise<ExtractedPrompt[]> {
  logger.debug(`[promptExtractor] Extracting prompts from content using LLM`);

  const ext = path.extname(filePath);
  const language = getLanguageFromExtension(ext);

  const prompt = dedent`
    Extract prompts being sent to LLM APIs from this ${language} code.

    TASK:
    1. Find where LLM APIs are called (OpenAI, Anthropic, etc.)
    2. Look at the message content being sent
    3. If content references a variable, trace back to find that variable's definition
    4. Extract the actual prompt text, replacing dynamic parts with {{variableName}}

    RULES:
    - When you see "content: someVar", find where someVar is defined
    - For template literals like \`Hello \${name}\`, extract as "Hello {{name}}"
    - For variables built from other variables, mark as {{variableName}}
    - Include all static text - this is the actual prompt being sent to the LLM
    - Ignore conditional logic (||, ??) - extract the template, not the fallback value

    OUTPUT FORMAT:
    [{
      "content": "The actual prompt text with {{variables}}",
      "line": <line number>,
      "role": "system" | "user" | "assistant",
      "apiProvider": "openai" | "anthropic" | etc,
      "confidence": 0.0-1.0,
      "reasoning": "Brief explanation"
    }]

    Return ONLY valid JSON array. No markdown, no explanations.
    If no prompts found, return: []

    Code to analyze:
    \`\`\`${language}
    ${content}
    \`\`\`

    JSON array:
  `;

  try {
    const { output, error } = await provider.callApi(
      JSON.stringify([{ role: 'user', content: prompt }]),
    );

    if (error) {
      throw new Error(`LLM API error: ${error}`);
    }

    if (typeof output !== 'string') {
      throw new Error(`Invalid output type: ${typeof output}`);
    }

    // Parse JSON from output
    let jsonStr = output.trim();
    // Use greedy match to handle nested code blocks in JSON content
    if (jsonStr.startsWith('```')) {
      const firstNewline = jsonStr.indexOf('\n');
      const lastBacktick = jsonStr.lastIndexOf('```');
      if (firstNewline !== -1 && lastBacktick > firstNewline) {
        jsonStr = jsonStr.substring(firstNewline + 1, lastBacktick).trim();
      }
    }

    // Fix common JSON issues
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
    jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');

    let llmPrompts: LLMExtractedPrompt[];
    let parsedOutput: any;
    try {
      parsedOutput = JSON.parse(jsonStr);
    } catch (parseError) {
      logger.warn('[promptExtractor] JSON parse error in extractPromptsFromContent', {
        error: parseError,
      });

      // Try to extract just the array
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          parsedOutput = JSON.parse(arrayMatch[0]);
        } catch {
          return [];
        }
      } else {
        return [];
      }
    }

    // Handle both array and single object responses
    if (Array.isArray(parsedOutput)) {
      llmPrompts = parsedOutput;
    } else if (typeof parsedOutput === 'object' && parsedOutput !== null) {
      // Check if the LLM wrapped the array in an object
      if ('result' in parsedOutput && Array.isArray(parsedOutput.result)) {
        logger.debug('[promptExtractor] Unwrapping result array from object');
        llmPrompts = parsedOutput.result;
      } else if ('prompts' in parsedOutput && Array.isArray(parsedOutput.prompts)) {
        logger.debug('[promptExtractor] Unwrapping prompts array from object');
        llmPrompts = parsedOutput.prompts;
      } else if ('data' in parsedOutput && Array.isArray(parsedOutput.data)) {
        logger.debug('[promptExtractor] Unwrapping data array from object');
        llmPrompts = parsedOutput.data;
      } else {
        llmPrompts = [parsedOutput];
      }
    } else {
      logger.warn('[promptExtractor] LLM output is neither an array nor an object');
      return [];
    }

    // Convert to ExtractedPrompt format
    const lines = content.split('\n');
    const extractedPrompts: ExtractedPrompt[] = [];

    for (const llmPrompt of llmPrompts) {
      // Validate prompt object
      if (!llmPrompt || typeof llmPrompt !== 'object') {
        continue;
      }

      if (!llmPrompt.content || typeof llmPrompt.content !== 'string') {
        continue;
      }

      if (typeof llmPrompt.confidence !== 'number') {
        continue;
      }

      if (llmPrompt.confidence < minConfidence) {
        continue;
      }

      const variables = detectVariables(llmPrompt.content);
      const lineNumber = llmPrompt.line || 1;
      const contextStart = Math.max(0, lineNumber - 2);
      const contextEnd = Math.min(lines.length, lineNumber + 2);
      const context = lines.slice(contextStart, contextEnd).join('\n');

      extractedPrompts.push({
        content: llmPrompt.content,
        variables,
        location: {
          file: filePath,
          line: lineNumber,
          context,
        },
        confidence: llmPrompt.confidence,
        apiProvider: llmPrompt.apiProvider,
        role: llmPrompt.role,
      });
    }

    return extractedPrompts;
  } catch (error) {
    logger.warn(`[promptExtractor] Failed to extract from content`, { error });
    return [];
  }
}

/**
 * Extract prompts from multiple files
 */
export async function extractPromptsFromFiles(
  filePaths: string[],
  provider: ApiProvider,
  minConfidence = 0.6,
): Promise<ExtractedPrompt[]> {
  logger.info(`[promptExtractor] Extracting prompts from ${filePaths.length} files using LLM`);

  const allPrompts: ExtractedPrompt[] = [];

  for (const filePath of filePaths) {
    try {
      const prompts = await extractPromptsFromFile(filePath, provider, minConfidence);
      allPrompts.push(...prompts);
    } catch (error) {
      logger.warn(`[promptExtractor] Failed to extract from ${filePath}`, { error });
    }
  }

  return allPrompts;
}

/**
 * Check if a file is supported for extraction
 */
export function isSupportedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const supportedExtensions = [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs',
    '.py',
    '.go',
    '.java',
    '.rb',
    '.php',
    '.rs',
  ];
  return supportedExtensions.includes(ext);
}

/**
 * Get language name from file extension
 */
function getLanguageFromExtension(ext: string): string {
  const languageMap: Record<string, string> = {
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.java': 'Java',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.rs': 'Rust',
  };

  return languageMap[ext.toLowerCase()] || 'code';
}

/**
 * Calculate similarity between two strings using a simple algorithm
 * Returns a value between 0 (completely different) and 1 (identical)
 */
function calculateSimilarity(str1: string, str2: string): number {
  // Normalize strings: lowercase, trim, collapse whitespace
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

  const s1 = normalize(str1);
  const s2 = normalize(str2);

  // Exact match
  if (s1 === s2) {
    return 1.0;
  }

  // Calculate simple similarity using longest common substring ratio
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) {
    return 1.0;
  }

  // Check if one string contains the other
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  // Calculate character-level similarity (simple Jaccard similarity)
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Group similar prompts together and mark duplicates
 * Returns prompts with similarity information
 */
export function detectSimilarPrompts(
  prompts: ExtractedPrompt[],
  similarityThreshold = 0.8,
): Array<ExtractedPrompt & { similarTo?: number[]; isDuplicate?: boolean }> {
  const results = prompts.map((p) => ({
    ...p,
    similarTo: [] as number[],
    isDuplicate: false,
  }));

  // Compare each prompt with every other prompt
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) {
      const similarity = calculateSimilarity(prompts[i].content, prompts[j].content);

      if (similarity >= similarityThreshold) {
        results[i].similarTo!.push(j);
        results[j].similarTo!.push(i);

        // Mark as duplicate if extremely similar (>0.95)
        if (similarity > 0.95) {
          // Mark the one with lower confidence as duplicate
          if (prompts[i].confidence < prompts[j].confidence) {
            results[i].isDuplicate = true;
          } else {
            results[j].isDuplicate = true;
          }
        }
      }
    }
  }

  logger.debug('[promptExtractor] Similarity detection complete', {
    total: prompts.length,
    duplicates: results.filter((r) => r.isDuplicate).length,
    withSimilar: results.filter((r) => r.similarTo && r.similarTo.length > 0).length,
  });

  return results;
}
