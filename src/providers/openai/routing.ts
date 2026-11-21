export function shouldDefaultToOpenAiResponses(modelName: string): boolean {
  // Some compatible gateways spell the legacy GPT-3.5 family as GPT-35.
  if (/^gpt-35(?:-|$)/.test(modelName)) {
    return false;
  }
  const version = /^gpt-(\d+)(?:\.(\d+))?(?:-|$)/.exec(modelName);
  if (!version) {
    return false;
  }
  const major = Number(version[1]);
  const minor = Number(version[2] ?? 0);
  return major > 5 || (major === 5 && minor >= 6);
}
