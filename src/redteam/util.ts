const REFUSAL_PREFIXES = [
  'Sorry',
  "I'm sorry",
  'I am sorry',
  "I'm not able to",
  'I am not able to',
  'I apologize',
];

export function isBasicRefusal(response: string): boolean {
  const lowerResponse = response.trim().toLowerCase();
  return REFUSAL_PREFIXES.some((prefix) => lowerResponse.startsWith(prefix));
}

export function removePrefix(str: string, prefix: string) {
  // Remove asteris from the prefix if if they exist. GPT loves to add them. eg: **Prompt:**
  str = str.replace(/^\*\*(.+?)\*\*:?\s*/, '$1');
  str = str.replace(new RegExp(prefix + ':', 'i'), '').trim();
  return str;
}
