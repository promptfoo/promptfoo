import chalk from 'chalk';
import Table from 'cli-table3';
import { TERMINAL_MAX_WIDTH } from './constants';
import { ResultFailureReason, type EvaluateTable } from './types';
import { ellipsize } from './util/text';

// Helper function to detect and format base64 image data for terminal display
function formatImageForTerminal(text: string, maxLength: number): string {
  // Check if this is a markdown image with base64 data
  const base64ImageMatch = text.match(/^!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)$/);
  
  if (base64ImageMatch) {
    const [, altText, imageFormat, base64Data] = base64ImageMatch;
    
    // Detect actual format from base64 data if the format seems incorrect
    let detectedFormat = imageFormat;
    if (imageFormat === 'png' && base64Data.startsWith('UklGR')) {
      // This is likely WebP (RIFF signature) but marked as PNG
      detectedFormat = 'webp';
    }
    
    const truncatedAltText = ellipsize(altText, Math.min(maxLength - 30, 50));
    const base64Preview = base64Data.substring(0, 8) + '...';
    return `[IMAGE: ${truncatedAltText}] (${detectedFormat.toUpperCase()}, ${base64Data.length} chars, data:${base64Preview})`;
  }
  
  // Check if this is a regular markdown image with URL
  const urlImageMatch = text.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (urlImageMatch) {
    const [, altText, imageUrl] = urlImageMatch;
    const truncatedAltText = ellipsize(altText, Math.min(maxLength - 20, 50));
    const truncatedUrl = ellipsize(imageUrl, Math.min(maxLength - truncatedAltText.length - 15, 30));
    return `[IMAGE: ${truncatedAltText}] (${truncatedUrl})`;
  }
  
  // Not an image, use regular ellipsize
  return ellipsize(text, maxLength);
}

export function generateTable(
  evaluateTable: EvaluateTable,
  tableCellMaxLength = 250,
  maxRows = 25,
): string {
  const head = evaluateTable.head;
  const headLength = head.prompts.length + head.vars.length;
  const table = new Table({
    head: [
      ...head.vars,
      ...head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
    ].map((h) => ellipsize(h, tableCellMaxLength)),
    colWidths: Array(headLength).fill(Math.floor(TERMINAL_MAX_WIDTH / headLength)),
    wordWrap: true,
    wrapOnWordBoundary: true, // if false, ansi colors break
    style: {
      head: ['blue', 'bold'],
    },
  });
  // Skip first row (header) and add the rest. Color PASS/FAIL
  for (const row of evaluateTable.body.slice(0, maxRows)) {
    table.push([
      ...row.vars.map((v) => formatImageForTerminal(v, tableCellMaxLength)),
      ...row.outputs.map(({ pass, score, text, failureReason: failureType }) => {
        text = formatImageForTerminal(text, tableCellMaxLength);
        if (pass) {
          return chalk.green('[PASS] ') + text;
        } else if (!pass) {
          // color everything red up until '---'
          return (
            chalk.red(failureType === ResultFailureReason.ASSERT ? '[FAIL] ' : '[ERROR] ') +
            text
              .split('---')
              .map((c, idx) => (idx === 0 ? chalk.red.bold(c) : c))
              .join('---')
          );
        }
        return text;
      }),
    ]);
  }
  return table.toString();
}

export function wrapTable(
  rows: Record<string, string | number>[],
  columnWidths?: Record<string, number>,
) {
  if (rows.length === 0) {
    return 'No data to display';
  }
  const head = Object.keys(rows[0]);

  // Calculate widths based on content and terminal width
  const defaultWidth = Math.floor(TERMINAL_MAX_WIDTH / head.length);
  const colWidths = head.map((column) => columnWidths?.[column] || defaultWidth);

  const table = new Table({
    head,
    colWidths,
    wordWrap: true,
    wrapOnWordBoundary: true,
  });
  for (const row of rows) {
    table.push(Object.values(row));
  }
  return table;
}
