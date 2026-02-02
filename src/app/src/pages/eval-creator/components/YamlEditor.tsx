import React from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { CopyButton } from '@app/components/ui/copy-button';
import { CancelIcon, SaveIcon } from '@app/components/ui/icons';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { useStore } from '@app/stores/evalConfig';
import yaml from 'js-yaml';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import type { UnifiedConfig } from '@promptfoo/types';
import 'prismjs/components/prism-yaml';
import 'prismjs/themes/prism.css';

interface YamlEditorProps {
  initialConfig?: unknown;
  readOnly?: boolean;
  initialYaml?: string;
}

// Schema comment that should always be at the top of the YAML file
const YAML_SCHEMA_COMMENT =
  '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json';

// Ensure the schema comment is at the top of YAML content
const ensureSchemaComment = (yamlContent: string): string => {
  if (!yamlContent.trim().startsWith(YAML_SCHEMA_COMMENT)) {
    return `${YAML_SCHEMA_COMMENT}\n${yamlContent}`;
  }
  return yamlContent;
};

const formatYamlWithSchema = (config: unknown): string => {
  const yamlContent = yaml.dump(config);
  return ensureSchemaComment(yamlContent);
};

const YamlEditorComponent = ({ initialConfig, readOnly = false, initialYaml }: YamlEditorProps) => {
  const [code, setCode] = React.useState('');
  const [originalCode, setOriginalCode] = React.useState('');
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const { showToast } = useToast();

  const { getTestSuite, updateConfig } = useStore();

  const parseAndUpdateStore = (yamlContent: string) => {
    try {
      // Remove the schema comment for parsing if it exists
      const contentForParsing = yamlContent.replace(YAML_SCHEMA_COMMENT, '').trim();
      const parsedConfig = yaml.load(contentForParsing) as Record<string, unknown>;

      if (parsedConfig && typeof parsedConfig === 'object') {
        // Simply update the config with the parsed YAML
        // The store will handle the mapping
        updateConfig(parsedConfig as Partial<UnifiedConfig>);

        setParseError(null);
        showToast('Configuration saved successfully', 'success');
        return true;
      } else {
        const errorMsg = 'Invalid YAML configuration';
        setParseError(errorMsg);
        showToast(errorMsg, 'error');
        return false;
      }
    } catch (err) {
      const errorMsg = `Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`;
      console.error(errorMsg, err);
      setParseError(errorMsg);
      showToast(errorMsg, 'error');
      return false;
    }
  };

  const handleSave = () => {
    const success = parseAndUpdateStore(code);
    if (success) {
      setOriginalCode(code);
      setHasUnsavedChanges(false);
    }
  };

  const handleCancel = () => {
    setCode(originalCode);
    setHasUnsavedChanges(false);
    setParseError(null);
    showToast('Changes discarded', 'info');
  };

  // Initial load effect
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  React.useEffect(() => {
    if (initialYaml) {
      const formattedCode = ensureSchemaComment(initialYaml);
      setCode(formattedCode);
      setOriginalCode(formattedCode);
    } else if (initialConfig) {
      const formattedCode = formatYamlWithSchema(initialConfig);
      setCode(formattedCode);
      setOriginalCode(formattedCode);
    } else {
      const currentConfig = getTestSuite();
      const formattedCode = formatYamlWithSchema(currentConfig);
      setCode(formattedCode);
      setOriginalCode(formattedCode);
    }
    // Deliberately omitting getTestSuite from dependencies to avoid potential re-render loops
  }, [initialYaml, initialConfig]);

  // Track unsaved changes
  React.useEffect(() => {
    setHasUnsavedChanges(code !== originalCode);
  }, [code, originalCode]);

  return (
    <div className="space-y-4 min-w-0">
      {/* Action bar */}
      {!readOnly && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={!hasUnsavedChanges}>
              <SaveIcon className="size-4 mr-2" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={!hasUnsavedChanges}
            >
              <CancelIcon className="size-4 mr-2" />
              Discard Changes
            </Button>
          </div>
          {hasUnsavedChanges && (
            <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              ● Unsaved changes
            </span>
          )}
        </div>
      )}

      {/* Error display */}
      {parseError && (
        <Alert variant="destructive">
          <AlertContent>
            <AlertDescription>{parseError}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {/* Editor Container */}
      <div className="relative min-w-0">
        <div
          className={cn(
            'rounded-lg overflow-auto max-h-[60vh]',
            'border-2 transition-all',
            hasUnsavedChanges ? 'border-primary' : 'border-border',
          )}
        >
          <Editor
            autoCapitalize="off"
            value={code}
            onValueChange={(newCode) => {
              if (readOnly) {
                return;
              }
              setCode(newCode);
              if (parseError) {
                setParseError(null);
              }
            }}
            highlight={(code) => {
              try {
                return Prism.languages.yaml
                  ? Prism.highlight(code, Prism.languages.yaml, 'yaml')
                  : code;
              } catch {
                return code;
              }
            }}
            padding={16}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
              minHeight: '300px',
            }}
            className={cn('bg-background', readOnly && 'cursor-default select-text')}
            disabled={readOnly}
          />
        </div>

        {/* Copy button - offset to avoid scrollbar */}
        <div className="absolute top-2 right-5">
          <CopyButton value={code} />
        </div>
      </div>
    </div>
  );
};

export default YamlEditorComponent;
