import logger from '../logger';
import { fetchWithRetries } from '../util/fetch';
import { getEnvString } from '../envars';

export interface GptOssSafeguardConfig {
  model?: string;
  reasoningLevel?: 'low' | 'medium' | 'high';
  outputFormat?: 'binary' | 'simple' | 'detailed';
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  // Support for multiple grader configurations
  multiGrader?: Array<{
    model: string;
    reasoning_effort?: 'low' | 'medium' | 'high' | 'minimal' | null;
  }>;
}

export interface GptOssSafeguardResponse {
  violation: 0 | 1;
  chain_of_thought?: string;
  output: {
    violation: 0 | 1;
    policy_category?: string | null;
    rule_ids?: string[];
    confidence?: 'low' | 'medium' | 'high';
    rationale?: string;
  };
  raw_response?: any;
}

/**
 * Client for GPT OSS Safeguard API via OpenRouter
 */
export class GptOssSafeguardClient {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly reasoningLevel: 'low' | 'medium' | 'high';
  private readonly outputFormat: 'binary' | 'simple' | 'detailed';
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(config: GptOssSafeguardConfig = {}) {
    // Get API key from config or environment
    this.apiKey =
      config.apiKey ||
      getEnvString('GPT_OSS_SAFEGUARD_API_KEY') ||
      getEnvString('OPENROUTER_API_KEY') ||
      '';

    if (!this.apiKey) {
      throw new Error(
        'GPT OSS Safeguard requires an API key. Set OPENROUTER_API_KEY or GPT_OSS_SAFEGUARD_API_KEY environment variable, or provide apiKey in config.',
      );
    }

    this.model = config.model || 'openai/gpt-oss-safeguard-20b';
    this.reasoningLevel = config.reasoningLevel || 'high';
    this.outputFormat = config.outputFormat || 'detailed';
    this.temperature = config.temperature ?? 1.0;
    this.maxTokens = config.maxTokens || 4096;

    logger.debug('[GPT OSS Safeguard] Initialized', {
      model: this.model,
      reasoningLevel: this.reasoningLevel,
      outputFormat: this.outputFormat,
    });
  }

  /**
   * Attempts to extract JSON from various response formats
   */
  private extractJson(content: string): any {
    // Try parsing as-is first
    try {
      return JSON.parse(content);
    } catch {
      // Continue to other methods
    }

    // Try extracting from markdown code blocks (```json ... ``` or ``` ... ```)
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Continue to other methods
      }
    }

    // Try extracting JSON object from text (look for { ... })
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Continue to other methods
      }
    }

    // If all parsing fails, return null
    return null;
  }

  /**
   * Formats a policy with reasoning level and output format instructions
   */
  private formatPolicy(policy: string): string {
    let outputFormatInstructions = '';

    switch (this.outputFormat) {
      case 'binary':
        outputFormatInstructions = 'Return exactly one character: 0 or 1.';
        break;
      case 'simple':
        outputFormatInstructions =
          'Return JSON: {"violation": 0 or 1, "policy_category": "category or null"}';
        break;
      case 'detailed':
        outputFormatInstructions = `Return JSON with the following structure:
{
  "violation": 0 or 1,
  "policy_category": "category or null",
  "rule_ids": ["list", "of", "violated", "rules"],
  "confidence": "low, medium, or high",
  "rationale": "Brief explanation of the decision"
}`;
        break;
    }

    return `Reasoning: ${this.reasoningLevel}

${policy}

${outputFormatInstructions}`;
  }

  /**
   * Parses the GPT OSS Safeguard response based on output format
   */
  private parseResponse(content: string, rawResponse: any): GptOssSafeguardResponse {
    // Extract chain of thought if available (in reasoning field)
    const chainOfThought = rawResponse.choices?.[0]?.message?.reasoning || undefined;

    switch (this.outputFormat) {
      case 'binary': {
        const violation = content.trim() === '1' ? 1 : 0;
        return {
          violation,
          chain_of_thought: chainOfThought,
          output: {
            violation,
          },
          raw_response: rawResponse,
        };
      }

      case 'simple': {
        const parsed = this.extractJson(content);
        if (parsed && typeof parsed.violation !== 'undefined') {
          return {
            violation: parsed.violation,
            chain_of_thought: chainOfThought,
            output: {
              violation: parsed.violation,
              policy_category: parsed.policy_category || null,
            },
            raw_response: rawResponse,
          };
        } else {
          logger.warn(
            '[GPT OSS Safeguard] Failed to parse simple JSON response, treating as violation',
            {
              contentPreview: content.substring(0, 100),
            },
          );
          return {
            violation: 1,
            chain_of_thought: chainOfThought,
            output: { violation: 1, policy_category: null },
            raw_response: rawResponse,
          };
        }
      }

      case 'detailed': {
        const parsed = this.extractJson(content);
        if (parsed && typeof parsed.violation !== 'undefined') {
          return {
            violation: parsed.violation,
            chain_of_thought: chainOfThought,
            output: {
              violation: parsed.violation,
              policy_category: parsed.policy_category || null,
              rule_ids: parsed.rule_ids || [],
              confidence: parsed.confidence || 'medium',
              rationale: parsed.rationale || '',
            },
            raw_response: rawResponse,
          };
        } else {
          logger.warn(
            '[GPT OSS Safeguard] Failed to parse detailed JSON response, treating as violation',
            {
              contentPreview: content.substring(0, 100),
            },
          );
          return {
            violation: 1,
            chain_of_thought: chainOfThought,
            output: {
              violation: 1,
              confidence: 'low',
              rationale: 'Failed to parse response',
              policy_category: null,
            },
            raw_response: rawResponse,
          };
        }
      }

      default:
        throw new Error(`Unknown output format: ${this.outputFormat}`);
    }
  }

  /**
   * Classifies content against a policy using GPT OSS Safeguard
   */
  async classify(policy: string, content: string): Promise<GptOssSafeguardResponse> {
    const formattedPolicy = this.formatPolicy(policy);

    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: formattedPolicy,
        },
        {
          role: 'user',
          content,
        },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    logger.debug('[GPT OSS Safeguard] Calling API', {
      model: this.model,
      contentLength: content.length,
      policyLength: policy.length,
    });

    try {
      const response = await fetchWithRetries(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://promptfoo.dev',
            'X-Title': 'Promptfoo RedTeam Grader',
          },
          body: JSON.stringify(requestBody),
        },
        10000, // 10 second timeout
        2, // 2 retries
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GPT OSS Safeguard API error (${response.status}): ${errorText}`);
      }

      const rawResponse = await response.json();
      const responseContent = rawResponse.choices?.[0]?.message?.content;

      if (!responseContent) {
        throw new Error('GPT OSS Safeguard API returned empty response');
      }

      logger.debug('[GPT OSS Safeguard] Received response', {
        hasChainOfThought: !!rawResponse.choices?.[0]?.message?.reasoning,
        contentLength: responseContent.length,
      });

      return this.parseResponse(responseContent, rawResponse);
    } catch (error) {
      logger.error('[GPT OSS Safeguard] API call failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Classifies content using multiple grader configurations in parallel
   */
  async classifyMulti(
    policy: string,
    content: string,
    graderConfigs: Array<{ model: string; reasoning_effort?: 'low' | 'medium' | 'high' | 'minimal' | null }>,
  ): Promise<Array<GptOssSafeguardResponse & { graderModel: string; reasoningEffort: string | null }>> {
    const formattedPolicy = this.formatPolicy(policy);

    logger.debug('[GPT OSS Safeguard Multi] Calling API with multiple graders', {
      graderCount: graderConfigs.length,
      models: graderConfigs.map(g => `${g.model}${g.reasoning_effort ? `(${g.reasoning_effort})` : ''}`),
    });

    const promises = graderConfigs.map(async (graderConfig) => {
      const requestBody: any = {
        model: `openai/${graderConfig.model}`,
        messages: [
          {
            role: 'system',
            content: formattedPolicy,
          },
          {
            role: 'user',
            content,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      };

      // Add reasoning_effort if specified
      if (graderConfig.reasoning_effort) {
        requestBody.reasoning_effort = graderConfig.reasoning_effort;
      }

      try {
        const response = await fetchWithRetries(
          `${this.baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://promptfoo.dev',
              'X-Title': 'Promptfoo RedTeam Multi-Grader',
            },
            body: JSON.stringify(requestBody),
          },
          10000,
          2,
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error (${response.status}): ${errorText}`);
        }

        const rawResponse = await response.json();
        const responseContent = rawResponse.choices?.[0]?.message?.content;

        if (!responseContent) {
          throw new Error('API returned empty response');
        }

        const parsed = this.parseResponse(responseContent, rawResponse);
        return {
          ...parsed,
          graderModel: graderConfig.model,
          reasoningEffort: graderConfig.reasoning_effort || null,
        };
      } catch (error) {
        logger.error(`[GPT OSS Safeguard Multi] Failed for ${graderConfig.model}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Return a failed response instead of throwing
        return {
          violation: 1 as 0 | 1,
          chain_of_thought: undefined,
          output: {
            violation: 1 as 0 | 1,
            confidence: 'low' as const,
            rationale: `Error: ${error instanceof Error ? error.message : String(error)}`,
            policy_category: null,
          },
          raw_response: {},
          graderModel: graderConfig.model,
          reasoningEffort: graderConfig.reasoning_effort || null,
        };
      }
    });

    return Promise.all(promises);
  }
}

/**
 * Creates a GPT OSS Safeguard client with the given configuration
 */
export function createGptOssSafeguardClient(config?: GptOssSafeguardConfig): GptOssSafeguardClient {
  return new GptOssSafeguardClient(config);
}
