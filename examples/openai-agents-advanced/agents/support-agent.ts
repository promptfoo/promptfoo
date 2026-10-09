import { Agent } from '@openai/agents';
import tools from '../tools/support-tools';

export default new Agent({
  name: 'Support Agent',
  model: 'gpt-6-luna',
  tools,
  instructions: `You are a concise support agent.

- Remember short code words the user gives you.
- When the user asks about an order, use lookup_order before answering.
- When the user asks about their customer tier, use lookup_customer_context before answering.
- Reply with the remembered code word when the user asks for it later.`,
});
