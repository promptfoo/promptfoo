import React, { useEffect, useState } from 'react';

import { ApiRequestError, callApiTyped } from '@app/utils/apiClient';
import TransformTestDialog from './TransformTestDialog';
import type { TestResponseTransformResponse } from '@promptfoo/dtos';

interface ResponseParserTestModalProps {
  open: boolean;
  onClose: () => void;
  currentTransform: string;
  onApply: (code: string) => void;
}

const ResponseParserTestModal: React.FC<ResponseParserTestModalProps> = ({
  open,
  onClose,
  currentTransform,
  onApply,
}) => {
  const [testInput, setTestInput] = useState('');
  const [editableTransform, setEditableTransform] = useState('');

  // Initialize editable transform when opening modal
  useEffect(() => {
    if (open) {
      setEditableTransform(currentTransform);
    }
  }, [open, currentTransform]);

  // Test handler function for response transform
  const handleTest = async (transformCode: string, testInput: string) => {
    try {
      const data = await callApiTyped<TestResponseTransformResponse>(
        '/providers/test-response-transform',
        {
          method: 'POST',
          body: {
            transformCode,
            response: testInput,
          },
        },
      );

      const result = data.result as { output?: unknown } | undefined;
      return {
        success: data.success,
        result: result?.output ?? data.result,
        error: data.error,
      };
    } catch (err) {
      if (err instanceof ApiRequestError) {
        return {
          success: false,
          error: err.message,
        };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to test transform',
      };
    }
  };

  return (
    <TransformTestDialog
      open={open}
      onClose={onClose}
      title="Test Response Parser"
      transformCode={editableTransform}
      onTransformCodeChange={setEditableTransform}
      testInput={testInput}
      onTestInputChange={setTestInput}
      testInputLabel="Test Response (JSON)"
      testInputPlaceholder="Enter the API response from your endpoint"
      testInputRows={8}
      onTest={handleTest}
      onApply={onApply}
      functionDocumentation={{
        signature: '(json, text, context) => ProviderResponse | string',
        description: (
          <>
            • <strong>json</strong>: any - Parsed JSON response (or null if not JSON)
            <br />• <strong>text</strong>: string - Raw response text
            <br />• <strong>context</strong>: {'{ response: FetchResult }'} - HTTP response metadata
            (optional)
            <br />
            <br />
            <strong>Returns:</strong> String output or {'{ output, tokenUsage?, error? }'}
          </>
        ),
        successMessage: 'Parser executed successfully!',
        outputLabel: 'Parsed Output:',
      }}
    />
  );
};

export default ResponseParserTestModal;
