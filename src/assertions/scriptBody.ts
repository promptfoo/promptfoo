export function buildScriptBody(renderedValue: string, defaultIndent: string): string {
  // YAML `value: |` block scalars keep a single trailing newline. Trim it before
  // deciding single- vs multi-line, mirroring handleJavascript's trimEnd.
  const trimmed = renderedValue.trimEnd();
  const isMultiline = trimmed.includes('\n');
  let indentStyle = defaultIndent;
  if (isMultiline) {
    // Detect the indentation style of the first indented line.
    const match = trimmed.match(/^(?!\s*$)\s+/m);
    if (match) {
      indentStyle = match[0];
    }
  }

  if (!isMultiline) {
    // Single-expression bodies implicitly return. An explicit leading `return`
    // stays as-is so we never emit `return return`.
    if (/^\s*return(?=\s|$)/.test(trimmed)) {
      return `${defaultIndent}${trimmed.trimStart()}`;
    }
    return `${defaultIndent}return ${trimmed}`;
  }

  return trimmed
    .split('\n')
    .map((line) => `${indentStyle}${line}`)
    .join('\n');
}
