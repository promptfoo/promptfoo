import { stringify as csvStringify } from 'csv-stringify/sync';
import { ResultFailureReason } from '../../types';

import type { EvaluateTableRow, Prompt } from '../../types';

export class DataExportService {
  /**
   * Generates CSV data from evaluation table data
   * Includes grader reason, comment, and conversation columns similar to client-side implementation
   *
   * @param table - The evaluation table data
   * @param options - Export options
   * @returns CSV formatted string
   */
  static generateCsvData(
    table: { head: { prompts: Prompt[]; vars: string[] }; body: EvaluateTableRow[] },
    options: { isRedteam?: boolean } = { isRedteam: false },
  ): string {
    const csvRows: any[][] = [];
    const { isRedteam } = options;

    // Check if any rows have descriptions
    const hasDescriptions = table.body.some((row) => row.test.description);

    // Create headers with additional columns for grader reason, comment, and conversation
    const headers: string[] = [
      ...(hasDescriptions ? ['Description'] : []),
      ...table.head.vars,
      ...table.head.prompts.flatMap((prompt) => {
        // Handle both Prompt and CompletedPrompt types
        const provider = (prompt as any).provider || '';
        const label = provider ? `[${provider}] ${prompt.label}` : prompt.label;
        return [label, 'Grader Reason', 'Comment'];
      }),
    ];

    if (isRedteam) {
      headers.push('Messages', 'RedteamHistory', 'RedteamTreeHistory');
    }
    csvRows.push(headers);

    // Process body rows with pass/fail prefixes and conversation data
    table.body.forEach((row) => {
      const rowValues: any[] = [
        ...(hasDescriptions ? [row.test.description || ''] : []),
        ...row.vars,
        ...row.outputs.flatMap((output) => {
          if (!output) {
            const emptyValues = ['', '', ''];
            if (isRedteam) {
              emptyValues.push('', '', '');
            }
            return emptyValues;
          }

          const baseValues = [
            // Add pass/fail/error prefix to text
            (output.pass
              ? '[PASS] '
              : output.failureReason === ResultFailureReason.ASSERT
                ? '[FAIL] '
                : '[ERROR] ') + (output.text || ''),
            // Add grader reason
            output.gradingResult?.reason || '',
            // Add comment
            output.gradingResult?.comment || '',
          ];

          if (isRedteam && output.metadata) {
            baseValues.push(
              // Messages column - for message-based providers (GOAT, Crescendo, SimulatedUser)
              output.metadata.messages ? JSON.stringify(output.metadata.messages) : '',
              // RedteamHistory column - for iterative provider (only if no messages)
              output.metadata.redteamHistory && !output.metadata.messages
                ? JSON.stringify(output.metadata.redteamHistory)
                : '',
              // RedteamTreeHistory column - for iterative tree provider (only if no messages)
              output.metadata.redteamTreeHistory && !output.metadata.messages
                ? JSON.stringify(output.metadata.redteamTreeHistory)
                : '',
            );
          } else if (isRedteam) {
            baseValues.push('', '', '');
          }

          return baseValues;
        }),
      ];
      csvRows.push(rowValues);
    });

    return csvStringify(csvRows);
  }

  /**
   * Generate JSON data from evaluation table
   * @param table Evaluation table data
   * @returns JSON object
   */
  static generateJsonData(table: {
    head: { prompts: Prompt[]; vars: string[] };
    body: EvaluateTableRow[];
  }): any {
    return table;
  }
}
