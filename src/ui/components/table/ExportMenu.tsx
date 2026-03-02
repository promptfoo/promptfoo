/**
 * ExportMenu - Ink component for export format selection.
 *
 * Shows available export formats and handles selection via keyboard.
 */

import { memo, useEffect, useRef, useState } from 'react';

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
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);
  const exportTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const completeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (exportTimeoutRef.current) {
        clearTimeout(exportTimeoutRef.current);
      }
      if (completeTimeoutRef.current) {
        clearTimeout(completeTimeoutRef.current);
      }
    };
  }, []);

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

    // Numeric shortcuts 1-4 for format selection
    if (/^[1-9]$/.test(input)) {
      const index = Number(input) - 1;
      const format = EXPORT_FORMATS[index];
      if (format) {
        handleExport(format.key);
        return;
      }
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
    exportTimeoutRef.current = setTimeout(() => {
      const result = exportTableToFile(data, format as ExportFormat);

      if (result.success) {
        const successMsg = `Exported to ${result.filePath}`;
        setMessage(successMsg);
        setState('done');
        setIsSuccess(true);
        // Give user time to see the message
        completeTimeoutRef.current = setTimeout(() => onComplete(true, successMsg), 1000);
      } else {
        const errorMsg = `Export failed: ${result.error}`;
        setMessage(errorMsg);
        setState('done');
        setIsSuccess(false);
        completeTimeoutRef.current = setTimeout(() => onComplete(false, errorMsg), 1500);
      }
    }, 100);
  };

  if (state === 'exporting' || state === 'done') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Export Results</Text>
        </Box>
        <Text color={state === 'done' ? (isSuccess ? 'green' : 'red') : 'cyan'}>{message}</Text>
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
            {index === selectedIndex ? '>' : ' '} [{index + 1}/{format.key}] {format.label}
          </Text>
          <Text dimColor> - {format.description}</Text>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>Press 1-4 or format key to select, Enter to confirm, Esc to cancel</Text>
      </Box>
    </Box>
  );
});
