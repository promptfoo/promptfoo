// Shared by configuration validation and direct assertion calls, without loading Natural.
export function getMeteorOptions(assertion: Record<string, unknown>) {
  const options = { alpha: 0.9, beta: 3, gamma: 0.5, threshold: 0.5 };
  for (const key of ['alpha', 'beta', 'gamma', 'threshold'] as const) {
    const value = assertion[key] ?? options[key];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      (key !== 'beta' && value > 1)
    ) {
      const range = key === 'beta' ? 'greater than or equal to 0' : 'between 0 and 1';
      throw new Error(`"meteor" assertion ${key} must be a finite number ${range}`);
    }
    options[key] = value;
  }
  return options;
}
