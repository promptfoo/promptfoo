import { handleJavascript } from '../javascript';
import { handlePython } from '../python';
import { handleRuby } from '../ruby';

import type { AssertionCapabilityPack } from '../registryTypes';

export const scriptAssertionPack = {
  name: 'scripts',
  handlers: {
    javascript: handleJavascript,
    python: handlePython,
    ruby: handleRuby,
  },
} satisfies AssertionCapabilityPack<
  Parameters<typeof handleJavascript>[0],
  Awaited<ReturnType<typeof handleJavascript>>
>;
