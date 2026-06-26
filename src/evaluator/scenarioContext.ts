export interface ScenarioSourceContext {
  basePath: string;
  envOverrides?: Record<string, string | undefined>;
  dependencies?: string[];
  watchRoots?: string[];
}

const SCENARIO_SOURCE_CONTEXT = Symbol.for('promptfoo.scenarioSourceContext');
const SCENARIO_TEST_SOURCE_CONTEXT = Symbol.for('promptfoo.scenarioTestSourceContext');
const SCENARIO_ORIGINAL_VALUE = Symbol.for('promptfoo.scenarioOriginalValue');

type ScenarioContextTarget = {
  [SCENARIO_SOURCE_CONTEXT]?: ScenarioSourceContext;
  [SCENARIO_TEST_SOURCE_CONTEXT]?: ScenarioSourceContext;
  [SCENARIO_ORIGINAL_VALUE]?: unknown;
};

function setHiddenContext(target: object, key: symbol, sourceContext: ScenarioSourceContext): void {
  Object.defineProperty(target, key, {
    value: sourceContext,
    configurable: true,
    writable: true,
  });
}

export function getScenarioSourceContext(scenario: object): ScenarioSourceContext | undefined {
  return (scenario as ScenarioContextTarget)[SCENARIO_SOURCE_CONTEXT];
}

export function setScenarioSourceContext(
  scenario: object,
  sourceContext: ScenarioSourceContext,
): void {
  setHiddenContext(scenario, SCENARIO_SOURCE_CONTEXT, sourceContext);
}

export function transferScenarioSourceContext<T extends object>(source: object, target: T): T {
  const sourceContext = getScenarioSourceContext(source);
  if (sourceContext) {
    setScenarioSourceContext(target, sourceContext);
  }
  return target;
}

export function getScenarioTestSourceContext(test: object): ScenarioSourceContext | undefined {
  return (test as ScenarioContextTarget)[SCENARIO_TEST_SOURCE_CONTEXT];
}

export function setScenarioTestSourceContext(
  test: object,
  sourceContext: ScenarioSourceContext,
): void {
  setHiddenContext(test, SCENARIO_TEST_SOURCE_CONTEXT, sourceContext);
}

export function transferScenarioTestSourceContext<T extends object>(source: object, target: T): T {
  const sourceContext = getScenarioTestSourceContext(source);
  if (sourceContext) {
    setScenarioTestSourceContext(target, sourceContext);
  }
  const originalValue = (source as ScenarioContextTarget)[SCENARIO_ORIGINAL_VALUE];
  if (originalValue !== undefined) {
    Object.defineProperty(target, SCENARIO_ORIGINAL_VALUE, {
      value: originalValue,
      configurable: true,
      writable: true,
    });
  }
  return target;
}
