/**
 * Regression fixture for #9383: multiple CallApiFunction providers must each
 * survive combineConfigs (the JSON.stringify-based dedupe used to collapse them
 * into a single entry).
 *
 * Mirrors the repro from the issue: three labeled function providers that each
 * embed their label in the response so the eval output is distinguishable.
 */

interface CallApiFunction {
  (prompt: string): Promise<{ output: string }>;
  label?: string;
}

interface UnifiedConfig {
  description?: string;
  providers: CallApiFunction[];
  prompts: string[];
  tests: Array<{ vars: Record<string, string> }>;
}

const makeProvider = (label: string): CallApiFunction => {
  const fn: CallApiFunction = async (prompt) => ({ output: `${label}: ${prompt}` });
  fn.label = label;
  return fn;
};

const config: UnifiedConfig = {
  description: 'Smoke test - multiple function providers (#9383)',
  providers: [makeProvider('a'), makeProvider('b'), makeProvider('c')],
  prompts: ['{{prompt}}'],
  tests: [{ vars: { prompt: 'hi' } }],
};

export default config;
