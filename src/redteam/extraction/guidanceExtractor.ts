import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import dedent from 'dedent';
import logger from '../../logger';
import { subCategoryDescriptions, pluginDescriptions } from '../constants/metadata';
import { getGraderById } from '../graders';
import { callExtraction } from './util';

import type { ApiProvider } from '../../types/index';

export interface GuidanceExtractionResult {
  [pluginId: string]: string | null; // null = no relevant guidance
}

// Maximum characters per chunk (leaving room for prompt overhead)
// ~100K chars ≈ ~25K tokens, safe for most models
const MAX_CHUNK_SIZE = 100000;
// Overlap between chunks to avoid missing content at boundaries
const CHUNK_OVERLAP = 2000;

/**
 * Gets context information for a plugin to help with guidance extraction.
 * Uses existing metadata and grader rubrics to provide rich context.
 */
function getPluginContext(pluginId: string): { description: string; rubric: string } {
  // Get description from existing metadata
  const description =
    (subCategoryDescriptions as Record<string, string>)[pluginId] ||
    (pluginDescriptions as Record<string, string>)[pluginId] ||
    'Evaluates AI output';

  // Get full rubric from grader
  let rubric = '';
  try {
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    if (grader?.rubric) {
      rubric = grader.rubric;
    }
  } catch {
    // Grader not found, continue without rubric
  }

  return { description, rubric };
}

/**
 * Splits a large document into overlapping chunks for processing.
 */
function chunkDocument(document: string, maxChunkSize: number, overlap: number): string[] {
  if (document.length <= maxChunkSize) {
    return [document];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < document.length) {
    let end = start + maxChunkSize;

    // Try to break at a paragraph or sentence boundary
    if (end < document.length) {
      // Look for paragraph break
      const paragraphBreak = document.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + maxChunkSize * 0.7) {
        end = paragraphBreak + 2;
      } else {
        // Look for sentence break
        const sentenceBreak = document.lastIndexOf('. ', end);
        if (sentenceBreak > start + maxChunkSize * 0.7) {
          end = sentenceBreak + 2;
        }
      }
    }

    chunks.push(document.slice(start, end));

    // Move to next chunk with overlap
    start = end - overlap;
    if (start >= document.length) break;
  }

  logger.debug(`[GuidanceExtraction] Split document into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Merges extraction results from multiple chunks.
 * If a plugin matches in multiple chunks, concatenates the guidance.
 */
function mergeChunkResults(
  results: GuidanceExtractionResult[],
  pluginIds: string[],
): GuidanceExtractionResult {
  const merged: GuidanceExtractionResult = {};

  for (const pluginId of pluginIds) {
    const guidanceParts: string[] = [];

    for (const result of results) {
      const guidance = result[pluginId];
      if (guidance) {
        // Avoid duplicates from overlapping chunks
        if (!guidanceParts.some((part) => guidance.includes(part) || part.includes(guidance))) {
          guidanceParts.push(guidance);
        }
      }
    }

    merged[pluginId] = guidanceParts.length > 0 ? guidanceParts.join('\n\n---\n\n') : null;
  }

  return merged;
}

/**
 * Builds the semantic extraction prompt.
 */
function buildExtractionPrompt(documentChunk: string, pluginContexts: string, pluginIds: string[]): string {
  return dedent`
    You are extracting grading guidelines for AI red-team evaluation plugins.

    DOCUMENT SECTION:
    ---
    ${documentChunk}
    ---

    PLUGINS TO EXTRACT GUIDANCE FOR:
    ${pluginContexts}

    TASK:
    For each plugin, extract any content from this document that would help evaluate
    whether an AI model's response passes or fails for that plugin's criteria.

    WHAT TO EXTRACT:
    - Sections discussing the plugin's topic (e.g., violence, privacy, honesty, manipulation)
    - Pass/fail criteria, examples, edge cases, or specific rules
    - Guidance on how to evaluate model responses for these concerns
    - Severity levels or thresholds if mentioned

    WHAT NOT TO EXTRACT:
    - Generic preambles or introductions
    - Content unrelated to the plugin's evaluation criteria
    - Overly broad statements that don't help with grading

    OUTPUT FORMAT (valid JSON only, no other text):
    {
      ${pluginIds.map((id) => `"${id}": "<relevant extracted text>" | null`).join(',\n      ')}
    }

    Return null for plugins where no relevant guidance exists in this document section.
  `;
}

/**
 * Extracts guidance from a single chunk.
 */
async function extractFromChunk(
  chunk: string,
  pluginContexts: string,
  pluginIds: string[],
  provider: ApiProvider,
  chunkIndex: number,
  totalChunks: number,
): Promise<GuidanceExtractionResult> {
  const prompt = buildExtractionPrompt(chunk, pluginContexts, pluginIds);

  if (totalChunks > 1) {
    logger.debug(`[GuidanceExtraction] Processing chunk ${chunkIndex + 1}/${totalChunks}`);
  }

  try {
    return await callExtraction(provider, prompt, (output: string) => {
      // Parse JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, output];
      const jsonStr = jsonMatch[1]?.trim() || output.trim();
      const parsed = JSON.parse(jsonStr) as GuidanceExtractionResult;

      // Normalize results
      const result: GuidanceExtractionResult = {};
      for (const pluginId of pluginIds) {
        const value = parsed[pluginId];
        if (value === null || value === 'null' || value === '' || value === undefined) {
          result[pluginId] = null;
        } else {
          result[pluginId] = String(value);
        }
      }
      return result;
    });
  } catch (error) {
    logger.warn(
      `[GuidanceExtraction] Failed to extract from chunk ${chunkIndex + 1}: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Return empty result for this chunk, continue with others
    const emptyResult: GuidanceExtractionResult = {};
    for (const pluginId of pluginIds) {
      emptyResult[pluginId] = null;
    }
    return emptyResult;
  }
}

/**
 * Extracts relevant guidance for each plugin from a full guidance document using an LLM.
 *
 * This function uses semantic extraction to identify and pull relevant portions of a grading
 * guidelines document for each plugin based on the plugin's purpose and evaluation criteria.
 *
 * For large documents that exceed context limits, the document is chunked and processed
 * in parallel, with results merged intelligently.
 *
 * @param fullDocument - The complete grading guidance document
 * @param pluginIds - Array of plugin IDs to extract guidance for
 * @param provider - The API provider to use for extraction
 * @returns A record mapping plugin IDs to their extracted guidance (or null if not relevant)
 */
export async function extractGuidanceForPlugins(
  fullDocument: string,
  pluginIds: string[],
  provider: ApiProvider,
): Promise<GuidanceExtractionResult> {
  if (pluginIds.length === 0) {
    logger.debug('[GuidanceExtraction] No plugins provided, returning empty result');
    return {};
  }

  // Build plugin context for the prompt
  const pluginContexts = pluginIds
    .map((id, i) => {
      const { description, rubric } = getPluginContext(id);
      return dedent`
      ${i + 1}. **${id}**
         Description: ${description}
         ${rubric ? `Grading rubric: ${rubric}` : ''}
    `;
    })
    .join('\n\n');

  // Chunk the document if necessary
  const chunks = chunkDocument(fullDocument, MAX_CHUNK_SIZE, CHUNK_OVERLAP);

  if (chunks.length === 1) {
    // Single chunk - process directly
    logger.debug(`[GuidanceExtraction] Processing document (${fullDocument.length} chars)`);
    return extractFromChunk(chunks[0], pluginContexts, pluginIds, provider, 0, 1);
  }

  // Multiple chunks - process in parallel and merge
  logger.info(
    `[GuidanceExtraction] Document is large (${fullDocument.length} chars), splitting into ${chunks.length} chunks`,
  );

  const chunkResults = await Promise.all(
    chunks.map((chunk, i) => extractFromChunk(chunk, pluginContexts, pluginIds, provider, i, chunks.length)),
  );

  const merged = mergeChunkResults(chunkResults, pluginIds);

  // Log summary
  const matchedCount = Object.values(merged).filter((v) => v !== null).length;
  logger.info(
    `[GuidanceExtraction] Merged results: ${matchedCount}/${pluginIds.length} plugins have relevant guidance`,
  );

  return merged;
}

/**
 * Extracts keywords from a plugin's rubric and description for search purposes.
 */
function extractKeywordsFromPlugin(pluginId: string): string[] {
  const { description, rubric } = getPluginContext(pluginId);

  // Extract meaningful words from description and rubric
  const allText = `${description} ${rubric}`.toLowerCase();

  // Common stop words to filter out
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'they',
    'them',
    'their',
    'what',
    'which',
    'who',
    'whom',
    'how',
    'when',
    'where',
    'why',
    'if',
    'then',
    'else',
    'so',
    'as',
    'not',
    'no',
    'yes',
    'any',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'only',
    'same',
    'than',
    'too',
    'very',
    'just',
    'also',
    'now',
    'output',
    'response',
    'model',
    'assistant',
    'user',
    'prompt',
    'test',
    'tests',
    'testing',
    'evaluate',
    'evaluates',
    'evaluation',
  ]);

  // Extract words (alphanumeric, 3+ chars, not stop words)
  const words = allText.match(/\b[a-z]{3,}\b/g) || [];
  const keywords = [...new Set(words.filter((w) => !stopWords.has(w)))];

  // Prioritize domain-specific keywords
  const priorityKeywords = keywords.filter(
    (w) =>
      w.includes('privacy') ||
      w.includes('pii') ||
      w.includes('harm') ||
      w.includes('violent') ||
      w.includes('crime') ||
      w.includes('inject') ||
      w.includes('security') ||
      w.includes('attack') ||
      w.includes('exploit') ||
      w.includes('bias') ||
      w.includes('discriminat') ||
      w.includes('medical') ||
      w.includes('financial') ||
      w.includes('compliance'),
  );

  // Return priority keywords first, then others, limited to 10
  return [...new Set([...priorityKeywords, ...keywords])].slice(0, 10);
}

/**
 * Builds the agent prompt for extracting guidance using tools.
 */
function buildAgentExtractionPrompt(pluginContexts: string): string {
  return dedent`
    You are extracting grading guidelines for AI red-team evaluation plugins from the document "guidance.md".

    TASK: Search the document for content relevant to each plugin below.
    Extract text that helps evaluate whether an AI response passes or fails.

    PLUGINS TO EXTRACT GUIDANCE FOR:
    ${pluginContexts}

    APPROACH:
    1. Use Grep to search for keywords relevant to each plugin (use the key concepts provided)
    2. Use Read to examine promising sections in more detail
    3. Extract the most relevant passages for each plugin

    WHAT TO EXTRACT:
    - Sections discussing the plugin's topic (e.g., violence, privacy, honesty, manipulation)
    - Pass/fail criteria, examples, edge cases, or specific rules
    - Guidance on how to evaluate model responses for these concerns
    - Severity levels or thresholds if mentioned

    WHAT NOT TO EXTRACT:
    - Generic preambles or introductions
    - Content unrelated to the plugin's evaluation criteria
    - Overly broad statements that don't help with grading

    Return null for plugins where no relevant guidance exists in this document.
  `;
}

/**
 * Builds the JSON schema for structured output based on plugin IDs.
 * Uses the format expected by Claude Agent SDK (schema at top level).
 */
function buildOutputSchema(pluginIds: string[]): {
  type: 'json_schema';
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
} {
  const properties: Record<string, unknown> = {};

  for (const pluginId of pluginIds) {
    properties[pluginId] = {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: `Extracted guidance for ${pluginId}, or null if no relevant guidance found`,
    };
  }

  return {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties,
      required: pluginIds,
      additionalProperties: false,
    },
  };
}

/**
 * Extracts relevant guidance for each plugin from a guidance document using Claude Agent SDK.
 *
 * This function uses an agent with Grep/Read tools to intelligently search the document
 * and extract relevant portions for each plugin. Unlike the LLM-only approach, this
 * handles large documents efficiently by using tool-based search instead of chunking.
 *
 * @param fullDocument - The complete grading guidance document
 * @param pluginIds - Array of plugin IDs to extract guidance for
 * @param options - Optional configuration for the agent
 * @returns A record mapping plugin IDs to their extracted guidance (or null if not relevant)
 */
export async function extractGuidanceForPluginsWithAgent(
  fullDocument: string,
  pluginIds: string[],
  options?: { model?: string; maxTurns?: number },
): Promise<GuidanceExtractionResult> {
  if (pluginIds.length === 0) {
    logger.debug('[GuidanceExtraction:Agent] No plugins provided, returning empty result');
    return {};
  }

  // Create a temporary directory for the document
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-guidance-'));
  const guidanceFilePath = path.join(tempDir, 'guidance.md');

  try {
    // Write the document to a temp file
    fs.writeFileSync(guidanceFilePath, fullDocument, 'utf-8');
    logger.debug(`[GuidanceExtraction:Agent] Wrote guidance to ${guidanceFilePath}`);

    // Build plugin contexts with keywords (simplified - no full rubrics to keep prompt manageable)
    const pluginContexts = pluginIds
      .map((id, i) => {
        const { description } = getPluginContext(id);
        const keywords = extractKeywordsFromPlugin(id);
        return dedent`
        ${i + 1}. **${id}**
           Description: ${description}
           Search keywords: ${keywords.join(', ')}
      `;
      })
      .join('\n\n');

    // Build the agent prompt with JSON output instruction
    const prompt =
      buildAgentExtractionPrompt(pluginContexts) +
      dedent`

      OUTPUT FORMAT:
      Return your final answer as a JSON object with plugin IDs as keys and extracted text as values.
      Use null for plugins where no relevant guidance was found.
      Example: {"harmful:violent-crime": "extracted text...", "pii:direct": null}
    `;

    // Dynamically import the Claude Agent SDK
    const { ClaudeCodeSDKProvider } = await import('../../providers/claude-agent-sdk');

    // Create the provider with appropriate configuration
    // Use ANTHROPIC_API_KEY from environment for authentication
    const provider = new ClaudeCodeSDKProvider({
      config: {
        working_dir: tempDir,
        model: options?.model || 'sonnet',
        // More turns needed for large documents with many plugins
        // Each plugin may need 2-3 grep/read operations
        // For very large documents (100K+), may need 100+ turns
        max_turns: options?.maxTurns || 100,
        // Allow read-only file tools for searching the document
        custom_allowed_tools: ['Read', 'Grep', 'Glob', 'LS'],
        // Bypass permissions since we're only using read-only tools in a temp directory
        permission_mode: 'bypassPermissions',
        allow_dangerously_skip_permissions: true,
        // Don't persist the session - this is an ephemeral extraction
        persist_session: false,
      },
    });

    logger.info(
      `[GuidanceExtraction:Agent] Starting agent-based extraction for ${pluginIds.length} plugins...`,
    );

    // Call the agent
    const response = await provider.callApi(prompt);

    if (response.error) {
      logger.error(`[GuidanceExtraction:Agent] Agent error: ${response.error}`);
      // Return empty results on error
      const emptyResult: GuidanceExtractionResult = {};
      for (const pluginId of pluginIds) {
        emptyResult[pluginId] = null;
      }
      return emptyResult;
    }

    // Parse the structured output
    let result: GuidanceExtractionResult;

    if (typeof response.output === 'object' && response.output !== null) {
      // Structured output was returned directly
      result = response.output as GuidanceExtractionResult;
    } else if (typeof response.output === 'string') {
      // Try to parse JSON from string response
      try {
        const jsonMatch = response.output.match(/```(?:json)?\s*([\s\S]*?)```/) || [
          null,
          response.output,
        ];
        const jsonStr = jsonMatch[1]?.trim() || response.output.trim();
        result = JSON.parse(jsonStr) as GuidanceExtractionResult;
      } catch (parseError) {
        logger.error(
          `[GuidanceExtraction:Agent] Failed to parse agent response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        );
        const emptyResult: GuidanceExtractionResult = {};
        for (const pluginId of pluginIds) {
          emptyResult[pluginId] = null;
        }
        return emptyResult;
      }
    } else {
      logger.error('[GuidanceExtraction:Agent] Unexpected response format from agent');
      const emptyResult: GuidanceExtractionResult = {};
      for (const pluginId of pluginIds) {
        emptyResult[pluginId] = null;
      }
      return emptyResult;
    }

    // Normalize results
    const normalizedResult: GuidanceExtractionResult = {};
    for (const pluginId of pluginIds) {
      const value = result[pluginId];
      if (value === null || value === 'null' || value === '' || value === undefined) {
        normalizedResult[pluginId] = null;
      } else {
        normalizedResult[pluginId] = String(value);
      }
    }

    // Log summary
    const matchedCount = Object.values(normalizedResult).filter((v) => v !== null).length;
    logger.info(
      `[GuidanceExtraction:Agent] Extraction complete: ${matchedCount}/${pluginIds.length} plugins have relevant guidance`,
    );

    return normalizedResult;
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      logger.debug(`[GuidanceExtraction:Agent] Cleaned up temp directory: ${tempDir}`);
    } catch (cleanupError) {
      logger.warn(
        `[GuidanceExtraction:Agent] Failed to clean up temp directory: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    }
  }
}
