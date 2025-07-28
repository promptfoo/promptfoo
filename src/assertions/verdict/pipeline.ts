/**
 * Pipeline and Layer implementations for Verdict
 * Based on verdict/core/primitive.py
 */

import { PreviousResultsImpl, createUnit } from './units';
import type {
  ExecutionContext,
  Layer,
  LayerConfig,
  Pipeline,
  PipelineConfig,
  PipelineStep,
  Unit,
  UnitConfig,
  UnitOutput,
} from './types';

enum LinkType {
  NONE = 'none',
  CHAIN = 'chain',
  DENSE = 'dense',
  BROADCAST = 'broadcast',
  CUMULATIVE = 'cumulative',
  LAST = 'last',
}

// ==================== Layer Implementation ====================

export class LayerImpl implements Layer {
  units: Unit[];
  config: LayerConfig;

  constructor(config: LayerConfig) {
    this.config = config;

    // Initialize units
    const baseUnits = Array.isArray(config.units)
      ? config.units
      : [config.units || (config as any).unit];
    this.units = [];

    // Handle repeat
    const repeat = config.repeat || 1;
    for (let i = 0; i < repeat; i++) {
      for (const unitConfig of baseUnits) {
        // Create unit from config or use existing unit
        let unit: Unit;
        if (this.isUnitInstance(unitConfig)) {
          // For existing units, we need to create a new instance for each repeat
          // This is a limitation - we can't properly clone unit instances
          throw new Error(
            'Cannot repeat existing unit instances. Use unit configurations instead.',
          );
        } else if (this.isUnitConfig(unitConfig)) {
          const typedConfig = unitConfig as { type: string; [key: string]: any };
          const { type, ...restConfig } = typedConfig;
          // Create a fresh unit for each repeat
          unit = createUnit(type, restConfig as UnitConfig);

          // Set name for repeated units
          if (repeat > 1 && i > 0) {
            unit.name = `${unit.name || 'unit'}_${i + 1}`;
          }
        } else {
          throw new Error(`Invalid unit configuration in layer: ${JSON.stringify(unitConfig)}`);
        }

        this.units.push(unit);
      }
    }
  }

  private isUnitInstance(obj: any): obj is Unit {
    return obj && typeof obj.execute === 'function' && typeof obj.type === 'string';
  }

  private isUnitConfig(obj: any): obj is { type: string; [key: string]: any } {
    return obj && typeof obj.type === 'string' && typeof obj.execute !== 'function';
  }

  async execute(input: any, context: ExecutionContext): Promise<UnitOutput[]> {
    const results: UnitOutput[] = [];
    const innerLink = this.config.inner || LinkType.NONE;
    const previous = context.previous || new PreviousResultsImpl();

    if (innerLink === LinkType.CHAIN) {
      // Execute units sequentially, passing output to next
      let currentInput = input;

      for (const unit of this.units) {
        const output = await unit.execute(currentInput, { ...context, previous });
        results.push(output);

        // Update previous results
        previous.units.set(unit, output);

        // Use output as input for next unit
        currentInput = { ...currentInput, ...output };
      }
    } else {
      // Execute units in parallel (NONE, DENSE, BROADCAST, etc.)
      const promises = this.units.map((unit) => unit.execute(input, { ...context, previous }));

      const outputs = await Promise.all(promises);

      // Store results
      for (let i = 0; i < this.units.length; i++) {
        results.push(outputs[i]);
        previous.units.set(this.units[i], outputs[i]);
      }
    }

    return results;
  }
}

// ==================== Pipeline Implementation ====================

export class PipelineImpl implements Pipeline {
  steps: (Unit | Layer)[];

  constructor(config: PipelineConfig | PipelineStep[]) {
    const steps = Array.isArray(config) ? config : config.steps;
    this.steps = [];

    for (const step of steps) {
      if (this.isUnit(step)) {
        this.steps.push(step);
      } else if (this.isLayer(step)) {
        this.steps.push(step);
      } else if (this.isLayerConfig(step)) {
        const layer = new LayerImpl(step.layer);
        this.steps.push(layer);
      } else if (this.isUnitConfig(step)) {
        const typedStep = step as { type: string; [key: string]: any };
        const { type, ...restConfig } = typedStep;
        const unit = createUnit(type, restConfig as UnitConfig);
        if (!unit || typeof unit.execute !== 'function') {
          throw new Error(`createUnit returned invalid unit for type: ${type}`);
        }
        this.steps.push(unit);
      } else {
        throw new Error(`Invalid pipeline step: ${JSON.stringify(step)}`);
      }
    }
  }

  async execute(input: any, context: ExecutionContext): Promise<any> {
    const previous = context.previous || new PreviousResultsImpl();
    let currentInput = input;
    let lastOutput: any = input;

    for (const step of this.steps) {
      if (this.isUnit(step)) {
        // Execute single unit
        const output = await step.execute(currentInput, { ...context, previous });
        previous.units.set(step, output);
        lastOutput = output;

        // Pass output to next step
        currentInput = { ...currentInput, ...output };
      } else if (this.isLayer(step)) {
        // Execute layer
        const outputs = await step.execute(currentInput, { ...context, previous });

        // For aggregation units, pass all results
        const nextInput = {
          ...currentInput,
          results: outputs,
        };

        // Update current input with all outputs
        for (const output of outputs) {
          Object.assign(currentInput, output);
        }

        currentInput = nextInput;
        lastOutput = outputs[outputs.length - 1] || lastOutput;
      } else {
        throw new Error(`Invalid pipeline step: neither Unit nor Layer. Step type: ${typeof step}`);
      }
    }

    return lastOutput;
  }

  private isUnit(step: any): step is Unit {
    return step && typeof step.execute === 'function' && !Array.isArray(step.units);
  }

  private isLayer(step: any): step is Layer {
    return step && typeof step.execute === 'function' && Array.isArray(step.units);
  }

  private isLayerConfig(step: any): step is { layer: LayerConfig } {
    return step && step.layer && (step.layer.units || step.layer.unit);
  }

  private isUnitConfig(step: any): step is { type: string; [key: string]: any } {
    return step && typeof step.type === 'string';
  }
}

// ==================== Helper Functions ====================

export function createPipeline(config: PipelineConfig | PipelineStep[]): Pipeline {
  return new PipelineImpl(config);
}

export function createLayer(config: LayerConfig): Layer {
  return new LayerImpl(config);
}
