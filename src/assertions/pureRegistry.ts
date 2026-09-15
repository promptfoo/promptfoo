import { pureAssertionPack } from './packs/pure';
import { AssertionRegistry } from './registry';

export type PureAssertionParams = Parameters<typeof pureAssertionPack.handlers.contains>[0];
export type PureGradingResult = Awaited<ReturnType<typeof pureAssertionPack.handlers.contains>>;

export function createPureAssertionRegistry(): AssertionRegistry<
  PureAssertionParams,
  PureGradingResult
> {
  return new AssertionRegistry([pureAssertionPack]);
}

export const pureAssertionRegistry = createPureAssertionRegistry();
