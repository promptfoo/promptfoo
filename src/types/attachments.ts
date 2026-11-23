import { getInputType, type Inputs } from './shared';

export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export function isBase64Attachment(value: string): boolean {
  return (
    /^[A-Za-z0-9+/]+={0,2}$/.test(value) &&
    value.length % 4 !== 1 &&
    (!value.includes('=') || value.length % 4 === 0)
  );
}

/** Include alternate file encodings retained in a serialized multi-input prompt. */
export function getInputRepresentations(
  vars: Record<string, unknown>,
  inputs: Inputs | undefined,
  fileInput?: string,
): [string, unknown][] {
  const entries = Object.entries(vars);
  if (typeof vars.__prompt === 'string') {
    try {
      const envelope = JSON.parse(vars.__prompt);
      if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) {
        for (const [key, value] of Object.entries(envelope)) {
          const input = inputs?.[key];
          if (
            value !== vars[key] &&
            (key === fileInput || (input && getInputType(input) !== 'text'))
          ) {
            entries.push([key, value]);
          }
        }
      }
    } catch {
      // Plain task prompts do not contain serialized input fields.
    }
  }
  // Replace whole data URIs before shorter raw encodings of the same file.
  return entries.sort(
    ([, a], [, b]) =>
      (typeof b === 'string' ? b.length : 0) - (typeof a === 'string' ? a.length : 0),
  );
}

// Strip the same binary representations from both target and grader text.
export function omitAttachmentData(
  text: string,
  entries: [string, unknown][],
  inputs: Inputs | undefined,
  pdfInput: string | undefined,
): string {
  for (const [key, value] of entries) {
    const definition = inputs?.[key];
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      (key !== pdfInput && definition && getInputType(definition) === 'text')
    ) {
      continue;
    }
    const uri = value.trim().match(/^data:[^,]+;base64,(.+)$/is);
    if (uri || key === pdfInput || definition) {
      const placeholder = key === pdfInput ? '[PDF attachment]' : '[Attachment]';
      for (const part of new Set(uri ? [value, uri[0], uri[1]] : [value])) {
        text = text.split(part).join(placeholder);
        const escaped = JSON.stringify(part).slice(1, -1);
        if (escaped !== part) {
          text = text.split(escaped).join(placeholder);
        }
      }
    }
  }
  return text;
}
