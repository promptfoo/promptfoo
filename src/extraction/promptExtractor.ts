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
    You are a code analysis assistant specialized in extracting LLM prompts from source code.

    Analyze the following ${language} code and identify ALL prompts being sent to LLM APIs (OpenAI, Anthropic, Claude, etc.).

    IMPORTANT: Extract EVERY distinct prompt you find, including:
    1. System prompts that define the AI's behavior
    2. User prompts and message templates
    3. Prompt templates with variables (e.g., "Hello {{name}}", "Answer: \${question}")
    4. Direct string literals in API calls
    5. Prompts in LLM framework configurations (LangChain, LlamaIndex, etc.)
    6. Multi-line prompts, template literals, and dedented strings
    7. Prompts in array/list structures (message arrays)
    8. Prompts in function calls or method chains

    For each distinct prompt found, provide:
    - content: The COMPLETE prompt text, preserving formatting (string)
    - line: Approximate line number where it starts (number)
    - role: "system", "user", or "assistant" (string, if identifiable from context)
    - apiProvider: "openai", "anthropic", "claude", or other provider name (string, if identifiable)
    - confidence: Score from 0 to 1 indicating certainty this is an LLM prompt (number)
    - reasoning: Brief explanation of why this is a prompt and how you identified it (string)

    Guidelines:
    - Extract the full prompt text, including template variables like {{var}}, \${var}, {var}, etc.
    - Include prompts even if they appear multiple times in different contexts
    - Use higher confidence (>0.8) for clear API calls, lower for uncertain cases
    - If a string could be a prompt but you're not sure, include it with lower confidence
    - Look for patterns: messages arrays, system/user roles, openai.chat.completions, etc.

    CRITICAL: Return ONLY a valid JSON array. Do not include:
    - Markdown code blocks or formatting
    - Explanatory text before or after the JSON
    - Comments in the JSON
    - Trailing commas

    If no prompts found, return: []

    Example output:
    [
      {
        "content": "You are a helpful assistant that answers questions concisely.",
        "line": 10,
        "role": "system",
        "apiProvider": "openai",
        "confidence": 0.95,
        "reasoning": "System message in OpenAI chat.completions call"
      },
      {
        "content": "Translate the following to French: {{text}}",
        "line": 25,
        "role": "user",
        "apiProvider": "anthropic",
        "confidence": 0.9,
        "reasoning": "Template prompt with variable in Anthropic messages API"
      }
    ]

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
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
      logger.debug('[promptExtractor] Extracted JSON from code block');
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
      // LLM returned a single object instead of an array - wrap it
      logger.debug('[promptExtractor] LLM returned single object, wrapping in array');
      llmPrompts = [parsedOutput];
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
    // Skip if below confidence threshold
    if (llmPrompt.confidence < minConfidence) {
      logger.debug(`[promptExtractor] Skipping low confidence prompt`, {
        confidence: llmPrompt.confidence,
        minConfidence,
      });
      continue;
    }

    // Detect variables in the prompt
    const variables = detectVariables(llmPrompt.content);

    // Get context around the line
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

    logger.debug(`[promptExtractor] Extracted prompt`, {
      line: lineNumber,
      confidence: llmPrompt.confidence,
      variableCount: variables.length,
      apiProvider: llmPrompt.apiProvider,
      role: llmPrompt.role,
    });
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
    You are a code analysis assistant specialized in extracting LLM prompts from source code.

    Analyze the following ${language} code and identify ALL prompts being sent to LLM APIs.

    IMPORTANT: Extract EVERY distinct prompt, including:
    - System prompts, user prompts, assistant messages
    - Templates with variables ({{var}}, \${var}, {var})
    - Multi-line prompts and template literals
    - Prompts in API calls and framework configurations

    For each prompt, provide:
    - content: Complete prompt text with variables (string)
    - line: Approximate line number (number)
    - role: "system", "user", or "assistant" if identifiable (string)
    - apiProvider: Provider name if identifiable (string)
    - confidence: Score 0-1 (number)
    - reasoning: Brief explanation (string)

    CRITICAL: Return ONLY valid JSON array. No markdown, no explanations, no trailing commas.

    If no prompts found, return: []

    Example:
    [
      {
        "content": "You are a helpful assistant.",
        "line": 1,
        "role": "system",
        "apiProvider": "openai",
        "confidence": 0.95,
        "reasoning": "System message in API call"
      }
    ]

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
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
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
      llmPrompts = [parsedOutput];
    } else {
      logger.warn('[promptExtractor] LLM output is neither an array nor an object');
      return [];
    }

    // Convert to ExtractedPrompt format
    const lines = content.split('\n');
    const extractedPrompts: ExtractedPrompt[] = [];

    for (const llmPrompt of llmPrompts) {
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
