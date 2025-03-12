import type { TestCase } from '../../../types';

export async function addInjections(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  const sampleSize = config.sample || 1;
  const harmfulOnly = config.harmfulOnly || false;
  const data: string[] = (await import('./data.json')).default;
  const injections =
    sampleSize === 1
      ? // Take skeleton key (the first one) by default
        [(prompt: string) => data[0].replace(/__PROMPT__/g, prompt)]
      : // Otherwise, take random samples
        data
          .sort(() => 0.5 - Math.random())
          .slice(0, sampleSize)
          .map((injection) => (prompt: string) => injection.replace(/__PROMPT__/g, prompt));

  const filteredTests = harmfulOnly
    ? testCases.filter((t) => t.metadata?.pluginId?.startsWith('harmful:'))
    : testCases;

  return filteredTests.flatMap((testCase) =>
    injections.map((fn) => ({
      ...testCase,
      assert: testCase.assert?.map((assert) => ({
        ...assert,
        metric: 'Harmful/Injection',
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: `${fn(String(testCase.vars![injectVar]))}`,
      },
    })),
  );
}
