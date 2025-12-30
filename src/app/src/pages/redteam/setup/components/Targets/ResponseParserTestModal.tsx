import React, { useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';
import TransformTestDialog from './TransformTestDialog';

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
    const response = await callApi('/providers/test-response-transform', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transformCode,
        response: testInput,
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: `Server error: ${response.status} ${response.statusText}` }));

      return {
        success: false,
        error: errorData.error || 'Failed to test transform',
      };
    }

    const data = await response.json();
    return {
      success: data.success,
      result: data.result?.output ?? data.result,
      error: data.error,
    };
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
