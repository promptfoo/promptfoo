/**
 * Base Unit implementation for Verdict
 * Based on verdict/core/primitive.py
 */

import { getDefaultProviders } from '../../../providers/defaults';
import { getNunjucksEngine } from '../../../util/templates';
import { accumulateTokenUsage } from '../../../util/tokenUsageUtils';
import type { ApiProvider, TokenUsage } from '../../../types';
import type {
  ExecutionContext,
  PreviousResults,
  Unit,
  UnitConfig,
  UnitInput,
  UnitOutput,
} from '../types';

export class PreviousResultsImpl implements PreviousResults {
  units: Map<Unit, UnitOutput> = new Map();

  get(unit: Unit): UnitOutput | undefined {
    return this.units.get(unit);
  }

  getByType<T extends UnitOutput = UnitOutput>(type: string): T[] {
    const results: T[] = [];
    for (const [unit, output] of this.units) {
      if (unit.type === type) {
        results.push(output as T);
      }
    }
    return results;
  }

  getByName<T extends UnitOutput = UnitOutput>(name: string): T | undefined {
    for (const [unit, output] of this.units) {
      if (unit.name === name) {
        return output as T;
      }
    }
    return undefined;
  }

  // Helper to get previous values for template rendering
  toTemplateVars(): Record<string, any> {
    const vars: Record<string, any> = {};

    // Add by name
    for (const [unit, output] of this.units) {
      if (unit.name) {
        vars[unit.name] = output;
      }
    }

    // Add by type (last one wins if multiple)
    for (const [unit, output] of this.units) {
      const typeName = unit.type.replace(/-/g, '_');
      vars[typeName] = output;
    }

    return vars;
  }
}

export abstract class BaseUnit<
  TInput extends UnitInput = UnitInput,
  TOutput extends UnitOutput = UnitOutput,
> implements Unit<TInput, TOutput>
{
  abstract type: string;
  name?: string;
  config: UnitConfig;

  constructor(config: UnitConfig = {}) {
    this.config = config;
    this.name = config.name;
  }

  async execute(input: TInput, context: ExecutionContext): Promise<TOutput> {
    // Get provider
    const provider = await this.getProvider(context);

    // Prepare prompt
    const promptText = await this.preparePrompt(input, context);

    // Make API call
    const response = await provider.callApi(promptText);

    if (response.error || !response.output) {
      throw new Error(`${this.type} unit failed: ${response.error || 'No output'}`);
    }

    // Parse response
    const parsed = this.parseResponse(response.output);

    // Validate if method exists
    if (this.validate) {
      this.validate(input, parsed);
    }

    // Process response
    const output = this.process ? this.process(input, parsed) : parsed;

    // Add token usage to context if available
    if (response.tokenUsage && context.vars) {
      const tokenUsage = (context.vars._tokenUsage as TokenUsage) || {
        total: 0,
        prompt: 0,
        completion: 0,
        numRequests: 0,
      };

      // Use promptfoo's token accumulation
      accumulateTokenUsage(tokenUsage, response.tokenUsage);
      context.vars._tokenUsage = tokenUsage;
    }

    return output;
  }

  protected async getProvider(context: ExecutionContext): Promise<ApiProvider> {
    const providerName = this.config.provider || context.provider;

    if (typeof providerName === 'string') {
      const { getAndCheckProvider } = await import('../../../matchers');
      return getAndCheckProvider('text', providerName, null, `${this.type} unit`);
    } else if (providerName) {
      return providerName;
    }

    // Use default grading provider
    const defaults = await getDefaultProviders();
    const { getAndCheckProvider } = await import('../../../matchers');
    return getAndCheckProvider('text', undefined, defaults.gradingProvider, `${this.type} unit`);
  }

  protected async preparePrompt(input: TInput, context: ExecutionContext): Promise<string> {
    if (!this.config.prompt) {
      throw new Error(`${this.type} unit requires a prompt`);
    }

    // Prepare template variables
    const vars: Record<string, any> = {
      ...context.vars,
      ...input,
      output: input.output,
    };

    // Add previous results if available
    if (context.previous && 'toTemplateVars' in context.previous) {
      vars.previous = (context.previous as any).toTemplateVars();
    }

    const nunjucks = getNunjucksEngine();
    return nunjucks.renderString(this.config.prompt, vars);
  }

  protected parseResponse(output: string): any {
    // Try to parse as JSON first
    try {
      // Handle markdown wrapped JSON
      const jsonMatch = output.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try direct JSON parse
      if (output.trim().startsWith('{')) {
        return JSON.parse(output);
      }
    } catch {
      // Not JSON, continue
    }

    // Return as-is for non-JSON responses
    return { response: output.trim() };
  }

  abstract validate?(input: TInput, response: any): void;
  abstract process?(input: TInput, response: any): TOutput;
}
