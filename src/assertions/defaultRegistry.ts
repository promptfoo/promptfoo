import { modelGradedAssertionPack } from './packs/modelGraded';
import { optionalAssertionPack } from './packs/optional';
import { providerAssertionPack } from './packs/provider';
import { pureAssertionPack } from './packs/pure';
import { redteamAssertionPack } from './packs/redteam';
import { scriptAssertionPack } from './packs/scripts';
import { traceAssertionPack } from './packs/trace';
import { webhookAssertionPack } from './packs/webhook';
import { AssertionRegistry } from './registry';

type DefaultAssertionParams = Parameters<typeof pureAssertionPack.handlers.contains>[0];
type DefaultGradingResult = Awaited<ReturnType<typeof pureAssertionPack.handlers.contains>>;

export const defaultAssertionRegistry = new AssertionRegistry<
  DefaultAssertionParams,
  DefaultGradingResult
>([
  pureAssertionPack,
  modelGradedAssertionPack,
  scriptAssertionPack,
  traceAssertionPack,
  optionalAssertionPack,
  providerAssertionPack,
  webhookAssertionPack,
  redteamAssertionPack,
]);
