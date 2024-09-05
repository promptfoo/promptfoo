import type { TestCase } from '../../../types';

export async function addInjections(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): Promise<TestCase[]> {
  const sampleSize = config.sample || 2;
  const harmfulOnly = config.harmfulOnly || false;
  const data: string[] = (await import('./data.json')).default;
  const injections = data
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
