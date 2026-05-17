import { tool } from '@openai/agents';
import { z } from 'zod';

export const lookupOrder = tool({
  name: 'lookup_order',
  description: 'Look up the shipping status for an order.',
  parameters: z.object({
    order_id: z.string(),
  }),
  execute: async ({ order_id }) => ({
    order_id,
    status: 'shipped',
  }),
});

export const lookupCustomerContext = tool({
  name: 'lookup_customer_context',
  description: 'Read the current customer tier from local run context.',
  parameters: z.object({}),
  execute: async (_args, runContext) => ({
    customer_tier:
      typeof runContext?.context === 'object' &&
      runContext.context !== null &&
      'customer_tier' in runContext.context
        ? runContext.context.customer_tier
        : 'unknown',
  }),
});

export default [lookupOrder, lookupCustomerContext];
