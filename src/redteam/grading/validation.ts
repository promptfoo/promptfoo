import { isEmptyResponse } from '../util';

import type { RedteamGradingContext } from './types';

export function validateRedteamTargetResponse(
  output: unknown,
  gradingContext?: RedteamGradingContext,
): void {
  const imagesForGrading = gradingContext?.imageOutputs ?? gradingContext?.providerResponse?.images;
  if (!imagesForGrading?.length && isEmptyResponse(output)) {
    throw new Error('Target provider returned an empty or nullish response');
  }
}
