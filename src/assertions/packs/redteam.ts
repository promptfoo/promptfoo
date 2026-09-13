import { handleRedteam } from '../redteam';

import type { AssertionCapabilityPack } from '../registryTypes';

export const redteamAssertionPack = {
  name: 'redteam',
  prefixes: [{ prefix: 'promptfoo:redteam:', handler: handleRedteam }],
} satisfies AssertionCapabilityPack<
  Parameters<typeof handleRedteam>[0],
  Awaited<ReturnType<typeof handleRedteam>>
>;
