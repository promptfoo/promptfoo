/**
 * Load system prompts dynamically based on agent role.
 */

const PROMPTS = {
  support: `You are a customer support agent. Be empathetic, acknowledge
the customer's frustration, and focus on resolving their issue quickly.`,

  sales: `You are a sales representative. Be helpful and informative about
our products and pricing. Don't be pushy - focus on understanding their needs.`,

  technical: `You are a technical support engineer. Provide clear, accurate
technical guidance. Include code examples or specific steps when relevant.`,
};

module.exports = async function (varName, prompt, otherVars) {
  const role = otherVars.role || 'support';
  const systemPrompt = PROMPTS[role] || PROMPTS.support;
  return { output: systemPrompt };
};
