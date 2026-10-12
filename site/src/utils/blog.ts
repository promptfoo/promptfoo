// Format tag label: "red-teaming" → "Red Teaming", "ai-security" → "AI Security"
export function formatTagLabel(label: string): string {
  const acronyms = ['ai', 'llm', 'owasp', 'mcp', 'rag', 'agi', 'a2a', 'eu'];
  return label
    .split('-')
    .map((word) => {
      if (acronyms.includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
