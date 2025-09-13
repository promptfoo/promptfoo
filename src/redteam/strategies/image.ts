import { neverGenerateRemote } from '../remoteGeneration';
import invariant from '../../util/invariant';

import type { TestCase } from '../../types';

// Re-export the basic local implementation
export { addImageToBase64Basic } from './imageBasic';

// Re-export the type definitions
export type { ImageStrategyConfig } from './imageTypes';

/**
 * Adds image encoding to test cases (server-side implementation)
 */
export async function addImageToBase64(
  testCases: TestCase[],
  injectVar: string,
  config?: Record<string, any>,
): Promise<TestCase[]> {
  if (neverGenerateRemote()) {
    throw new Error('Image strategy requires remote generation to be enabled');
  }

  // For server-side image generation, we use the provider pattern
  // The actual work is done by the ImageProvider which communicates with the server
  // This function just prepares the test cases for the provider
  return testCases.map((testCase) => {
    invariant(
      testCase.vars,
      `Image encoding: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
    );

    return {
      ...testCase,
      provider: `promptfoo:redteam:image:{"injectVar":"${injectVar}","imageConfig":${JSON.stringify(config || {})}}`,
      metadata: {
        ...testCase.metadata,
        strategyId: 'image',
      },
    };
  });
}
