import { pureAssertionPack } from './packs/pure';
import { AssertionRegistry } from './registry';

export type PureAssertionParams = Parameters<typeof pureAssertionPack.handlers.contains>[0];
export type PureGradingResult = Awaited<ReturnType<typeof pureAssertionPack.handlers.contains>>;
export type PureAssertionBaseType = keyof typeof pureAssertionPack.handlers;
export const pureInverseAssertionBaseTypes = [
  'bleu',
  'contains',
  'contains-all',
  'contains-any',
  'equals',
  'finish-reason',
  'gleu',
  'icontains',
  'icontains-all',
  'icontains-any',
  'regex',
  'starts-with',
  'tool-call-f1',
  'word-count',
] as const satisfies readonly PureAssertionBaseType[];
export type PureInverseAssertionBaseType = (typeof pureInverseAssertionBaseTypes)[number];
export type PureAssertionType = PureAssertionBaseType | `not-${PureInverseAssertionBaseType}`;

export function createPureAssertionRegistry(): AssertionRegistry<
  PureAssertionParams,
  PureGradingResult
> {
  return new AssertionRegistry([pureAssertionPack]);
}

export const pureAssertionRegistry = createPureAssertionRegistry();
