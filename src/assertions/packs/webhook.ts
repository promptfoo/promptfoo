import { handleWebhook } from '../webhook';

import type { AssertionCapabilityPack } from '../registryTypes';

export const webhookAssertionPack = {
  name: 'webhook',
  handlers: {
    webhook: handleWebhook,
  },
} satisfies AssertionCapabilityPack<
  Parameters<typeof handleWebhook>[0],
  Awaited<ReturnType<typeof handleWebhook>>
>;
