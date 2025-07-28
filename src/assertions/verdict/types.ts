/**
 * Verdict: A TypeScript port of the Verdict library for scaling judge-time compute
 * Based on https://github.com/haizelabs/verdict
 *
 * @citation
 * Kalra, N., & Tang, L. (2025). VERDICT: A Library for Scaling Judge-Time Compute.
 * arXiv preprint arXiv:2502.18018.
 */

import type { ApiProvider, GradingResult, TestCase, ProviderOptions } from '../../types';

// ==================== Scale Types ====================

export interface Scale<T = any> {
  values: T[];
  validate(value: T): boolean;
  serialize(): string;
  includes(value: T): boolean;
}

export interface ScaleField {
  type: 'scale';
  scale: Scale;
}

// ==================== Schema Types ====================

export interface Schema {
  [key: string]: any;
}

export interface UnitInput extends Schema {
  output: string;
  prompt?: string;
  vars?: Record<string, any>;
}

export interface UnitResponse extends Schema {
  score?: number | string;
  explanation?: string;
  choice?: string;
  chosen?: string;
}

export interface UnitOutput extends Schema {
  score?: number | string;
  explanation?: string;
  choice?: string;
  chosen?: string;
}

// ==================== Unit Types ====================

export interface UnitConfig {
  name?: string;
  prompt?: string;
  provider?: ApiProvider | string;
  temperature?: number;
  retries?: number;
  explanation?: boolean;
  categories?: string[] | Scale<string>;
  scale?: Scale<number> | [number, number] | number[];
  options?: string[];
  weights?: Record<string, number> | number[];
}

export interface Unit<TInput = UnitInput, TOutput = UnitOutput> {
  name?: string;
  type: string;
  config: UnitConfig;

  execute(input: TInput, context: ExecutionContext): Promise<TOutput>;
  validate?(input: TInput, response: any): void;
  process?(input: TInput, response: any): TOutput;
}

// ==================== Layer Types ====================

export type LinkType = 'none' | 'chain' | 'dense' | 'broadcast' | 'cumulative' | 'last';

export interface LayerConfig {
  units: Unit[] | Unit;
  repeat?: number;
  inner?: LinkType;
  outer?: LinkType;
}

export interface Layer {
  units: Unit[];
  config: LayerConfig;

  execute(input: any, context: ExecutionContext): Promise<any[]>;
}

// ==================== Pipeline Types ====================

export type PipelineStep =
  | Unit
  | Layer
  | { layer: LayerConfig }
  | { type: string; [key: string]: any };

export interface PipelineConfig {
  steps: PipelineStep[];
}

export interface Pipeline {
  steps: (Unit | Layer)[];

  execute(input: any, context: ExecutionContext): Promise<any>;
}

// ==================== Execution Context ====================

export interface ExecutionContext {
  provider?: ApiProvider;
  test?: TestCase;
  vars?: Record<string, any>;
  previous?: PreviousResults;
}

export interface PreviousResults {
  units: Map<Unit, UnitOutput>;

  get(unit: Unit): UnitOutput | undefined;
  getByType<T extends UnitOutput = UnitOutput>(type: string): T[];
  getByName<T extends UnitOutput = UnitOutput>(name: string): T | undefined;
}

// ==================== Verdict Config ====================

export type VerdictValue =
  | string
  | {
      prompt?: string;
      type?: 'categorical' | 'likert' | 'judge' | 'verify' | string;
      categories?: string[];
      expectedCategories?: string[]; // Categories that should be considered passing
      scale?: [number, number] | number[];
      explanation?: boolean;
      provider?: string | ProviderOptions | ApiProvider;
      threshold?: number;
      pipeline?: PipelineConfig;
    };

export interface VerdictConfig {
  value: VerdictValue;
  threshold?: number;
  provider?: string;
}

// ==================== Grading Result Extension ====================

export interface VerdictGradingResult extends GradingResult {
  verdictDetails?: {
    executionTrace?: any[];
    tokenUsage?: {
      total: number;
      prompt: number;
      completion: number;
    };
  };
}
