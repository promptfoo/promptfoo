export function markdownCell(value: string | number): string {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&');
}
export function xml(value: string | number): string {
  // XML 1.0 excludes controls, noncharacters and lone UTF-16 surrogates.
  let safe = '';
  for (const character of String(value)) {
    const point = character.codePointAt(0)!;
    safe +=
      point === 9 ||
      point === 10 ||
      point === 13 ||
      (point >= 0x20 && point <= 0xd7ff) ||
      (point >= 0xe000 && point <= 0xfffd) ||
      (point >= 0x10000 && point <= 0x10ffff)
        ? character
        : '\ufffd';
  }
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class TextBuilder {
  private readonly parts: string[] = [];
  private bytes = 0;
  constructor(private readonly limit: number) {}
  line(text = ''): void {
    this.bytes += Buffer.byteLength(text, 'utf8') + 1;
    if (this.bytes > this.limit) {
      throw new Error('Rendered report exceeds the output byte limit');
    }
    this.parts.push(text);
  }
  finish(): string {
    return `${this.parts.join('\n')}\n`;
  }
}
