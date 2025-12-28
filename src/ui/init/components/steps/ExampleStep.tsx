/**
 * ExampleStep - Select and download an example.
 *
 * Fetches the list of examples from GitHub and allows the user
 * to select one to download.
 */

import { useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { NavigationBar } from '../shared/NavigationBar';
import { SearchableSelect } from '../shared/SearchableSelect';

export interface ExampleStepProps {
  /** List of available examples */
  examples: string[];
  /** Whether examples are loading */
  isLoading: boolean;
  /** Error message if loading failed */
  error?: string | null;
  /** Callback when example is selected */
  onSelect: (example: string) => void;
  /** Callback when going back */
  onBack: () => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Callback to retry loading */
  onRetry: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

/**
 * ExampleStep component for example selection.
 */
export function ExampleStep({
  examples,
  isLoading,
  error,
  onSelect,
  onBack,
  onCancel: _onCancel,
  onRetry,
  isFocused = true,
}: ExampleStepProps) {
  const [selectedExample, setSelectedExample] = useState<string | undefined>(undefined);

  // Handle keyboard for back/cancel
  useInput(
    (input, key) => {
      if (!isFocused) {
        return;
      }

      if (key.escape) {
        onBack();
        return;
      }

      // Retry on 'r' when error
      if (input === 'r' && error) {
        onRetry();
        return;
      }
    },
    { isActive: isFocused },
  );

  // Loading state
  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Loading examples...</Text>
        </Box>
        <Box>
          <Text color="cyan">⠋</Text>
          <Text dimColor> Fetching example list from GitHub</Text>
        </Box>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="red" bold>
            Failed to load examples
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
        <NavigationBar
          canGoBack={true}
          showNext={false}
          actions={[{ key: 'r', label: 'Retry' }]}
          showHelp={false}
        />
      </Box>
    );
  }

  // Build items for SearchableSelect
  const items = examples.map((example) => ({
    value: example,
    label: example,
    description: getExampleDescription(example),
  }));

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Choose an example to download</Text>
      </Box>

      <SearchableSelect
        items={items}
        value={selectedExample}
        onSelect={(value) => {
          setSelectedExample(value);
          onSelect(value);
        }}
        searchable={true}
        searchPlaceholder="Type to filter examples..."
        maxVisible={12}
        isFocused={isFocused}
      />

      <NavigationBar canGoBack={true} showNext={false} showHelp={false} />
    </Box>
  );
}

/**
 * Get a description for an example based on its name.
 */
function getExampleDescription(name: string): string {
  // Extract description from example name
  const descriptions: Record<string, string> = {
    'openai-chat': 'Basic OpenAI chat completion',
    'openai-function-calling': 'OpenAI function/tool calling',
    'anthropic-chat': 'Claude conversation example',
    'rag-basic': 'Simple RAG evaluation',
    'rag-advanced': 'Advanced RAG with multiple retrievers',
    'redteam-basic': 'Basic security testing',
    'agent-tool-use': 'Agent with tool use evaluation',
    langchain: 'LangChain integration',
    llamaindex: 'LlamaIndex integration',
  };

  // Check for partial matches
  for (const [key, desc] of Object.entries(descriptions)) {
    if (name.toLowerCase().includes(key.toLowerCase())) {
      return desc;
    }
  }

  // Default description based on name patterns
  if (name.includes('redteam')) {
    return 'Security/red team testing';
  }
  if (name.includes('rag')) {
    return 'RAG evaluation example';
  }
  if (name.includes('agent')) {
    return 'Agent evaluation example';
  }

  return 'Promptfoo configuration example';
}

/**
 * DownloadProgress component for showing download progress.
 */
export function DownloadProgress({
  exampleName,
  progress,
  downloadedFiles,
}: {
  exampleName: string;
  progress: number;
  downloadedFiles: string[];
}) {
  const progressBar =
    '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Downloading {exampleName}...</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="cyan">[{progressBar}]</Text>
        <Text dimColor> {progress}%</Text>
      </Box>

      {downloadedFiles.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>Files downloaded:</Text>
          {downloadedFiles.slice(-5).map((file) => (
            <Text key={file} dimColor>
              {'  '}✓ {file}
            </Text>
          ))}
          {downloadedFiles.length > 5 && (
            <Text dimColor> ... and {downloadedFiles.length - 5} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * DownloadComplete component for showing download success.
 */
export function DownloadComplete({
  exampleName,
  directory,
  filesCount,
}: {
  exampleName: string;
  directory: string;
  filesCount: number;
}) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="green" bold>
          ✓ Example downloaded successfully!
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text>
          Downloaded <Text bold>{exampleName}</Text> to <Text bold>{directory}</Text>
        </Text>
        <Text dimColor>{filesCount} files created</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold>Next steps:</Text>
        <Text>
          {' '}
          1. <Text color="cyan">cd {directory}</Text>
        </Text>
        <Text> 2. Review the README.md file</Text>
        <Text>
          {' '}
          3. <Text color="cyan">promptfoo eval</Text>
        </Text>
      </Box>
    </Box>
  );
}
