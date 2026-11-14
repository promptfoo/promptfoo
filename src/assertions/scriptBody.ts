export function buildScriptBody(renderedValue: string, defaultIndent: string): string {
  const isMultiline = renderedValue.includes('\n');
  let indentStyle = defaultIndent;
  if (isMultiline) {
    // Detect the indentation style of the first indented line.
    const match = renderedValue.match(/^(?!\s*$)\s+/m);
    if (match) {
      indentStyle = match[0];
    }
  }

  return isMultiline
    ? renderedValue
        .split('\n')
        .map((line) => `${indentStyle}${line}`)
        .join('\n')
    : `${defaultIndent}return ${renderedValue}`;
}
