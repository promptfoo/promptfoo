/**
 * ExportMenu - Ink component for export format selection.
 *
 * Shows available export formats and handles selection via keyboard.
 */

import { memo, useState } from 'react';

import { Box, Text, useInput } from 'ink';
import {
  EXPORT_FORMATS,
  type ExportFormat,
  exportTableToFile,
  getFormatFromKey,
} from '../../utils/export';

import type { EvaluateTable } from '../../../types/index';

export interface ExportMenuProps {
  /** Table data to export */
  data: EvaluateTable;
  /** Callback when export completes (success or failure) */
  onComplete: (success: boolean, message: string) => void;
  /** Callback when user cancels (Escape) */
  onCancel: () => void;
}

type ExportState = 'selecting' | 'exporting' | 'done';

/**
 * Export menu component with format selection.
 */
export const ExportMenu = memo(function ExportMenu({
  data,
  onComplete,
  onCancel,
}: ExportMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [state, setState] = useState<ExportState>('selecting');
  const [message, setMessage] = useState('');

  useInput((input, key) => {
    if (state !== 'selecting') {
      return;
    }

    // Cancel with Escape or q
    if (key.escape || input.toLowerCase() === 'q') {
      onCancel();
      return;
    }

    // Navigate with arrow keys
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : EXPORT_FORMATS.length - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev < EXPORT_FORMATS.length - 1 ? prev + 1 : 0));
      return;
    }

    // Select with Enter
    if (key.return) {
      const format = EXPORT_FORMATS[selectedIndex];
      handleExport(format.key);
      return;
    }

    // Direct selection with format key
    const format = getFormatFromKey(input);
    if (format) {
      handleExport(input);
    }
  });

  const handleExport = (key: string) => {
    const format = getFormatFromKey(key);
    if (!format) {
      return;
    }

    setState('exporting');
    setMessage(`Exporting as ${format.toUpperCase()}...`);

    // Small delay to show the exporting state
    setTimeout(() => {
      const result = exportTableToFile(data, format as ExportFormat);

      if (result.success) {
        const successMsg = `Exported to ${result.filePath}`;
        setMessage(successMsg);
        setState('done');
        // Give user time to see the message
        setTimeout(() => onComplete(true, successMsg), 1000);
      } else {
        const errorMsg = `Export failed: ${result.error}`;
        setMessage(errorMsg);
        setState('done');
        setTimeout(() => onComplete(false, errorMsg), 1500);
      }
    }, 100);
  };

  if (state === 'exporting' || state === 'done') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Export Results</Text>
        </Box>
        <Text color={state === 'done' ? 'green' : 'cyan'}>{message}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Export Results</Text>
        <Text dimColor> - Select format:</Text>
      </Box>

      {EXPORT_FORMATS.map((format, index) => (
        <Box key={format.key}>
          <Text color={index === selectedIndex ? 'cyan' : undefined}>
            {index === selectedIndex ? '>' : ' '} [{format.key}] {format.label}
          </Text>
          <Text dimColor> - {format.description}</Text>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>Press key to select, Enter to confirm, Esc to cancel</Text>
      </Box>
    </Box>
  );
});
