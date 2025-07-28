/**
 * Scale implementations for Verdict
 * Based on verdict/scale.py
 */

import type { Scale } from './types';

export class DiscreteScale<T = string> implements Scale<T> {
  constructor(public values: T[]) {
    if (values.length === 0) {
      throw new Error('DiscreteScale must have at least one value');
    }
  }

  validate(value: T): boolean {
    return this.includes(value);
  }

  includes(value: T): boolean {
    return this.values.includes(value);
  }

  serialize(): string {
    return JSON.stringify(this.values);
  }
}

export class LikertScale implements Scale<number> {
  public values: number[];

  constructor(
    public min: number = 1,
    public max: number = 5,
  ) {
    if (min >= max) {
      throw new Error('LikertScale min must be less than max');
    }
    this.values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  validate(value: number): boolean {
    return Number.isInteger(value) && value >= this.min && value <= this.max;
  }

  includes(value: number): boolean {
    return this.validate(value);
  }

  serialize(): string {
    return `[${this.min}, ${this.max}]`;
  }
}

export class BooleanScale extends DiscreteScale<boolean> {
  constructor() {
    super([true, false]);
  }
}

export class BinaryScale extends DiscreteScale<string> {
  constructor(
    public positive: string = 'yes',
    public negative: string = 'no',
  ) {
    super([positive, negative]);
  }

  get yes(): string {
    return this.positive;
  }

  get no(): string {
    return this.negative;
  }
}

// Utility function to create scales from config
export function createScale(config: any): Scale {
  if (Array.isArray(config)) {
    if (config.length === 2 && typeof config[0] === 'number' && typeof config[1] === 'number') {
      return new LikertScale(config[0], config[1]);
    }
    return new DiscreteScale(config);
  }

  if (typeof config === 'object' && config.type) {
    switch (config.type) {
      case 'discrete':
        return new DiscreteScale(config.values);
      case 'likert':
        return new LikertScale(config.min, config.max);
      case 'boolean':
        return new BooleanScale();
      case 'binary':
        return new BinaryScale(config.positive, config.negative);
      default:
        throw new Error(`Unknown scale type: ${config.type}`);
    }
  }

  throw new Error('Invalid scale configuration');
}
