/**
 * PreviewStep - Preview files before writing.
 *
 * Shows all files that will be created and allows the user
 * to confirm or go back to make changes.
 */

import { Box, Text, useInput } from 'ink';
import { FilePreview } from '../shared/FilePreview';
import { NavigationBar } from '../shared/NavigationBar';

import type { FileToWrite } from '../../machines/initMachine.types';

export interface PreviewStepProps {
  /** Files to preview */
  files: FileToWrite[];
  /** Output directory */
  directory: string;
  /** Callback when overwrite is toggled */
  onToggleOverwrite: (path: string) => void;
  /** Callback when confirmed */
  onConfirm: () => void;
  /** Callback when going back */
  onBack: () => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

/**
 * PreviewStep component for file preview before writing.
 */
export function PreviewStep({
  files,
  directory,
  onToggleOverwrite,
  onConfirm,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: PreviewStepProps) {
  // Count files by status
  const newFiles = files.filter((f) => !f.exists);
  const overwriteFiles = files.filter((f) => f.exists && f.overwrite);
  const skipFiles = files.filter((f) => f.exists && !f.overwrite);

  // Handle keyboard
  useInput(
    (_input, key) => {
      if (!isFocused) {
        return;
      }

      if (key.escape) {
        onBack();
        return;
      }

      if (key.return) {
        onConfirm();
        return;
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Review files to create</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          Target directory: <Text color="cyan">{directory}</Text>
        </Text>
      </Box>

      {/* File counts */}
      <Box marginBottom={1} gap={2}>
        {newFiles.length > 0 && <Text color="green">✓ {newFiles.length} new</Text>}
        {overwriteFiles.length > 0 && <Text color="red">! {overwriteFiles.length} overwrite</Text>}
        {skipFiles.length > 0 && <Text color="yellow">⚠ {skipFiles.length} skip</Text>}
      </Box>

      <FilePreview
        files={files}
        onToggleOverwrite={onToggleOverwrite}
        isFocused={isFocused}
        maxLines={12}
      />

      <NavigationBar canGoBack={true} showNext={true} nextLabel="Write files" showHelp={false} />
    </Box>
  );
}

/**
 * WritingStep component shown while files are being written.
 */
export function WritingStep({
  files,
  filesWritten,
}: {
  files: FileToWrite[];
  filesWritten: string[];
}) {
  const progress = Math.round((filesWritten.length / files.length) * 100);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Writing files...</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="cyan">
          [{'█'.repeat(Math.floor(progress / 5))}
          {'░'.repeat(20 - Math.floor(progress / 5))}]
        </Text>
        <Text dimColor> {progress}%</Text>
      </Box>

      <Box flexDirection="column">
        {files.map((file) => {
          const isWritten = filesWritten.includes(file.path);
          const willSkip = file.exists && !file.overwrite;

          return (
            <Box key={file.path}>
              <Text color={isWritten ? 'green' : willSkip ? 'yellow' : undefined}>
                {isWritten ? '✓' : willSkip ? '⊘' : '○'}{' '}
              </Text>
              <Text dimColor={!isWritten && !willSkip}>
                {file.relativePath}
                {willSkip && ' (skipped)'}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * CompleteStep component shown after files are written.
 */
export function CompleteStep({
  directory,
  filesWritten,
  configPath,
  isRedteam = false,
}: {
  directory: string;
  filesWritten: string[];
  configPath: string;
  isRedteam?: boolean;
}) {
  const runCommand = isRedteam ? 'promptfoo redteam run' : 'promptfoo eval';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="green" bold>
          ✓ Project initialized successfully!
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          Created {filesWritten.length} files in <Text bold>{directory}</Text>
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold>Next steps:</Text>
        <Box flexDirection="column" marginLeft={2}>
          {directory !== '.' && (
            <Text>
              1. <Text color="cyan">cd {directory}</Text>
            </Text>
          )}
          <Text>
            {directory !== '.' ? '2' : '1'}. Set your API keys (e.g.,{' '}
            <Text color="cyan">export OPENAI_API_KEY=...</Text>)
          </Text>
          <Text>
            {directory !== '.' ? '3' : '2'}. Edit <Text color="cyan">{configPath}</Text> to
            customize
          </Text>
          <Text>
            {directory !== '.' ? '4' : '3'}. Run <Text color="cyan">{runCommand}</Text>
          </Text>
        </Box>
      </Box>

      <Box>
        <Text dimColor>Press any key to exit</Text>
      </Box>
    </Box>
  );
}
