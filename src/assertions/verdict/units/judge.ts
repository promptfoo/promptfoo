/**
 * Judge unit implementations for Verdict
 * Based on verdict/common/judge.py
 */

import { BaseUnit } from './base';
import { BinaryScale, DiscreteScale, LikertScale } from '../scales';
import type { ExecutionContext, Scale, UnitConfig, UnitInput, UnitOutput } from '../types';

// ==================== Judge Unit ====================

interface JudgeUnitConfig extends UnitConfig {
  scale?: Scale<number> | [number, number] | number[];
}

interface JudgeUnitOutput extends UnitOutput {
  score: number;
  explanation?: string;
  _scale?: {
    min: number;
    max: number;
  };
}

export class JudgeUnit extends BaseUnit<UnitInput, JudgeUnitOutput> {
  type = 'judge';
  scale: Scale<number>;

  constructor(config: JudgeUnitConfig = {}) {
    super(config);

    // Initialize scale
    if (config.scale) {
      if (Array.isArray(config.scale)) {
        if (config.scale.length === 2) {
          this.scale = new LikertScale(config.scale[0], config.scale[1]);
        } else {
          this.scale = new DiscreteScale(config.scale);
        }
      } else {
        this.scale = config.scale;
      }
    } else {
      this.scale = new LikertScale(1, 5); // Default
    }
  }

  protected async preparePrompt(input: UnitInput, context: ExecutionContext): Promise<string> {
    let prompt = await super.preparePrompt(input, context);
    
    // Add explanation request if configured
    if (this.config.explanation) {
      prompt += '\n\nProvide your score and explain your reasoning.';
    }
    
    return prompt;
  }

  protected parseResponse(output: string): any {
    const parsed = super.parseResponse(output);

    // Extract score from various formats
    if (typeof parsed === 'object') {
      if ('score' in parsed) {
        return parsed;
      }
      if ('rating' in parsed) {
        parsed.score = parsed.rating;
        return parsed;
      }
    }

    // Try to extract score from text - multiple patterns
    const patterns = [
      /(?:score|rating|rate)[\s:]*(\d+(?:\.\d+)?)/i,
      /\b(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*\d+/i,
      /\*\*(\d+(?:\.\d+)?)\*\*/,
      /\b(\d+(?:\.\d+)?)\b.*(?:scale|1-5|1 to 5)/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return {
          score: parseFloat(match[1]),
          response: output,
          // Try to extract explanation if available
          explanation: output.includes('because') || output.includes('since') ? output : undefined,
        };
      }
    }

    throw new Error(`Could not extract score from response: ${output}`);
  }

  validate(input: UnitInput, response: any): void {
    if (!('score' in response)) {
      throw new Error('Response must include a score');
    }

    const score = Number(response.score);
    if (isNaN(score)) {
      throw new Error(`Invalid score: ${response.score}`);
    }

    if (!this.scale.validate(score)) {
      throw new Error(`Score ${score} is not valid for scale ${this.scale.serialize()}`);
    }
  }

  process(input: UnitInput, response: any): JudgeUnitOutput {
    const output: JudgeUnitOutput = {
      score: Number(response.score),
      _scale: {
        min: this.scale instanceof LikertScale ? this.scale.min : Math.min(...(this.scale as DiscreteScale<number>).values),
        max: this.scale instanceof LikertScale ? this.scale.max : Math.max(...(this.scale as DiscreteScale<number>).values),
      },
    };

    if (this.config.explanation && response.explanation) {
      output.explanation = response.explanation;
    } else if (this.config.explanation && response.reasoning) {
      output.explanation = response.reasoning;
    }

    return output;
  }
}

// ==================== Categorical Judge Unit ====================

interface CategoricalJudgeConfig extends UnitConfig {
  categories?: string[] | Scale<string>;
}

interface CategoricalJudgeOutput extends UnitOutput {
  choice: string;
  explanation?: string;
}

export class CategoricalJudgeUnit extends BaseUnit<UnitInput, CategoricalJudgeOutput> {
  type = 'categorical-judge';
  scale: Scale<string>;

  constructor(config: CategoricalJudgeConfig = {}) {
    super(config);

    // Initialize scale
    if (config.categories) {
      if (Array.isArray(config.categories)) {
        this.scale = new DiscreteScale(config.categories);
      } else {
        this.scale = config.categories;
      }
    } else {
      this.scale = new BinaryScale('yes', 'no'); // Default
    }
  }

  protected async preparePrompt(input: UnitInput, context: any): Promise<string> {
    const basePrompt = await super.preparePrompt(input, context);

    // Add category instructions if not already in prompt
    let prompt = basePrompt;
    if (
      !basePrompt.toLowerCase().includes('choose') &&
      !basePrompt.toLowerCase().includes('select')
    ) {
      const categories = this.scale.values.join(', ');
      prompt = `${basePrompt}\n\nChoose one of the following: ${categories}`;
    }

    // Add explanation request if configured
    if (this.config.explanation) {
      prompt += '\n\nProvide your choice and explain your reasoning.';
    }

    return prompt;
  }

  protected parseResponse(output: string): any {
    const parsed = super.parseResponse(output);

    // Extract choice from various formats
    if (typeof parsed === 'object') {
      if ('choice' in parsed) {
        return parsed;
      }
      if ('answer' in parsed) {
        parsed.choice = parsed.answer;
        return parsed;
      }
      if ('decision' in parsed) {
        parsed.choice = parsed.decision;
        return parsed;
      }
      if ('category' in parsed) {
        parsed.choice = parsed.category;
        return parsed;
      }
    }

    // Try to find category in text
    const lowerOutput = output.toLowerCase().trim();

    // Look for exact match first
    for (const category of this.scale.values) {
      if (lowerOutput === category.toLowerCase()) {
        return {
          choice: category,
          response: output,
        };
      }
    }

    // Look for category in response with word boundaries
    for (const category of this.scale.values) {
      const regex = new RegExp(`\\b${category.toLowerCase()}\\b`, 'i');
      if (regex.test(output)) {
        return {
          choice: category,
          response: output,
          // Extract explanation if available
          explanation: output.length > category.length + 20 ? output : undefined,
        };
      }
    }

    throw new Error(
      `Could not extract category from response. Expected one of: ${this.scale.values.join(', ')}. Got: ${output}`,
    );
  }

  validate(input: UnitInput, response: any): void {
    if (!('choice' in response)) {
      throw new Error('Response must include a choice');
    }

    if (!this.scale.includes(response.choice)) {
      throw new Error(`Choice "${response.choice}" is not one of: ${this.scale.values.join(', ')}`);
    }
  }

  process(input: UnitInput, response: any): CategoricalJudgeOutput {
    const output: CategoricalJudgeOutput = {
      choice: response.choice,
    };

    if (this.config.explanation && response.explanation) {
      output.explanation = response.explanation;
    } else if (this.config.explanation && response.reasoning) {
      output.explanation = response.reasoning;
    }

    return output;
  }
}

// ==================== Pairwise Judge Unit ====================

interface PairwiseJudgeConfig extends UnitConfig {
  options?: string[];
}

declare module '../types' {
  interface UnitConfig {
    options?: string[];
  }
}

interface PairwiseJudgeInput extends UnitInput {
  options: string[];
}

interface PairwiseJudgeOutput extends UnitOutput {
  choice: string;
  chosen: string;
  explanation?: string;
}

export class PairwiseJudgeUnit extends BaseUnit<PairwiseJudgeInput, PairwiseJudgeOutput> {
  type = 'pairwise-judge';
  scale: DiscreteScale<string>;

  constructor(config: PairwiseJudgeConfig = {}) {
    super(config);
    this.scale = new DiscreteScale(['A', 'B']);
  }

  protected async preparePrompt(input: PairwiseJudgeInput, context: any): Promise<string> {
    // Ensure we have options
    const options = input.options || this.config.options;
    if (!options || options.length !== 2) {
      throw new Error('Pairwise judge requires exactly 2 options');
    }

    // Add options to vars
    const vars = {
      ...context.vars,
      ...input,
      option_a: options[0],
      option_b: options[1],
      options: options,
    };

    // Update context with new vars
    context = { ...context, vars };

    const basePrompt = await super.preparePrompt(input, context);

    // Add option display if not in prompt
    if (!basePrompt.includes('Option A') && !basePrompt.includes('option_a')) {
      return `${basePrompt}\n\nOption A: ${options[0]}\n\nOption B: ${options[1]}\n\nWhich option is better? Choose A or B.`;
    }

    return basePrompt;
  }

  protected parseResponse(output: string): any {
    const parsed = super.parseResponse(output);

    // Extract choice
    if (typeof parsed === 'object' && 'choice' in parsed) {
      return parsed;
    }

    // Look for A or B in response
    const upperOutput = output.toUpperCase();
    if (upperOutput.includes('OPTION A') || upperOutput.match(/\bA\b/)) {
      return { choice: 'A', response: output };
    }
    if (upperOutput.includes('OPTION B') || upperOutput.match(/\bB\b/)) {
      return { choice: 'B', response: output };
    }

    throw new Error(`Could not determine choice (A or B) from response: ${output}`);
  }

  validate(input: PairwiseJudgeInput, response: any): void {
    if (!('choice' in response)) {
      throw new Error('Response must include a choice');
    }

    const choice = response.choice.toUpperCase();
    if (choice !== 'A' && choice !== 'B') {
      throw new Error(`Choice must be A or B, got: ${response.choice}`);
    }
  }

  process(input: PairwiseJudgeInput, response: any): PairwiseJudgeOutput {
    const options = input.options || this.config.options || [];
    const choiceIndex = response.choice.toUpperCase() === 'A' ? 0 : 1;

    const output: PairwiseJudgeOutput = {
      choice: response.choice.toUpperCase(),
      chosen: options[choiceIndex],
    };

    if (this.config.explanation && response.explanation) {
      output.explanation = response.explanation;
    } else if (this.config.explanation && response.reasoning) {
      output.explanation = response.reasoning;
    }

    return output;
  }
}

// ==================== Verification Unit ====================

export class VerifyUnit extends CategoricalJudgeUnit {
  type = 'verify';

  constructor(config: UnitConfig = {}) {
    super({
      ...config,
      categories: ['valid', 'invalid'],
    });
  }

  protected async preparePrompt(input: UnitInput, context: any): Promise<string> {
    // Default verification prompt if none provided
    if (!this.config.prompt) {
      this.config.prompt = `
Check if the previous judgment is valid and well-reasoned.

Previous output: {{previous.explanation || previous.response}}

Is the reasoning valid? Answer with "valid" or "invalid".
`;
    }

    return super.preparePrompt(input, context);
  }
}
