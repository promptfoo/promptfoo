import React from 'react';

import { Alert } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { AlertCircle, AlignLeft, CheckCircle, ChevronDown, Info, Play } from 'lucide-react';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';

interface TransformTestDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  transformCode: string;
  onTransformCodeChange: (code: string) => void;
  testInput: string;
  onTestInputChange: (input: string) => void;
  testInputLabel: string;
  testInputPlaceholder: string;
  testInputRows?: number;
  onTest: (
    transformCode: string,
    testInput: string,
  ) => Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }>;
  onApply?: (transformCode: string) => void;
  functionDocumentation: {
    signature: string;
    description: React.ReactNode;
    successMessage: string;
    outputLabel: string;
  };
}

const highlightJS = (code: string): string => {
  try {
    const grammar = (Prism as any)?.languages?.javascript;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'javascript');
  } catch {
    return code;
  }
};

const highlightJSON = (code: string): string => {
  try {
    const grammar = (Prism as any)?.languages?.json;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'json');
  } catch {
    return code;
  }
};

const TransformTestDialog: React.FC<TransformTestDialogProps> = ({
  open,
  onClose,
  title,
  transformCode,
  onTransformCodeChange,
  testInput,
  onTestInputChange,
  testInputLabel,
  testInputPlaceholder,
  testInputRows = 3,
  onTest,
  onApply,
  functionDocumentation,
}) => {
  const [testLoading, setTestLoading] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    success: boolean;
    result?: any;
    error?: string;
    noTransform?: boolean;
  } | null>(null);
  const [testInputExpanded, setTestInputExpanded] = React.useState(true);
  const [formatError, setFormatError] = React.useState<string | null>(null);

  const formatJson = () => {
    try {
      const parsed = JSON.parse(testInput);
      const formatted = JSON.stringify(parsed, null, 2);
      onTestInputChange(formatted);
      setFormatError(null);
    } catch (error) {
      setFormatError(error instanceof Error ? error.message : 'Invalid JSON');
      setTimeout(() => setFormatError(null), 3000);
    }
  };

  const testTransform = async () => {
    if (!testInput || !testInput.trim()) {
      setTestResult({
        success: false,
        error: `Please provide a ${testInputLabel.toLowerCase()}`,
      });
      return;
    }

    setTestLoading(true);
    try {
      const result = await onTest(transformCode, testInput);
      // Add info if no transform was applied
      if (!transformCode?.trim() && result.success) {
        setTestResult({
          ...result,
          noTransform: true,
        });
      } else {
        setTestResult(result);
      }
    } catch (error) {
      console.error('Error testing transform:', error);
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test transform',
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleApply = () => {
    if (onApply) {
      onApply(transformCode);
      onClose();
    }
  };

  // Reset test result when dialog opens
  React.useEffect(() => {
    if (open) {
      setTestResult(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-6xl flex-col p-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-hidden md:flex-row">
          {/* Left side - Input */}
          <div className="flex flex-[0_0_58%] flex-col">
            <div className="flex flex-1 flex-col gap-4">
              {/* Test Input */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">{testInputLabel}</h4>
                <Collapsible
                  open={testInputExpanded}
                  onOpenChange={setTestInputExpanded}
                  className="mb-4 rounded-md bg-black/5 dark:bg-white/5"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between p-3">
                    <span className="text-sm">Test input</span>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Format JSON"
                            className="rounded p-1 hover:bg-black/10 dark:hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              formatJson();
                            }}
                          >
                            <AlignLeft className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Format JSON</TooltipContent>
                      </Tooltip>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform',
                          testInputExpanded && 'rotate-180',
                        )}
                      />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 pb-3">
                    {formatError && (
                      <Alert variant="destructive" className="mb-2">
                        <AlertCircle className="h-4 w-4" />
                        <span>{formatError}</span>
                      </Alert>
                    )}
                    <div className="overflow-hidden rounded border border-border bg-white dark:bg-zinc-900">
                      <Editor
                        value={testInput}
                        onValueChange={onTestInputChange}
                        highlight={highlightJSON}
                        padding={10}
                        placeholder={testInputPlaceholder}
                        style={{
                          fontFamily: '"Fira code", "Fira Mono", monospace',
                          fontSize: 14,
                          minHeight: `${testInputRows * 20}px`,
                        }}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Transform Code Editor */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">Transform Function</h4>
                <details className="mb-2 cursor-pointer rounded bg-black/5 p-3 dark:bg-white/5">
                  <summary className="select-none text-sm font-medium">
                    View expected response format
                  </summary>
                  <div className="mt-3 text-sm">{functionDocumentation.description}</div>
                </details>
                <details className="mb-4 cursor-pointer rounded bg-black/5 p-3 dark:bg-white/5">
                  <summary className="select-none text-sm font-medium">
                    View function signature
                  </summary>
                  <div className="mt-3">
                    <p className="mb-2 text-sm">
                      <strong>Function signature:</strong>
                    </p>
                    <pre className="m-0 whitespace-pre-wrap font-mono text-xs">
                      {functionDocumentation.signature}
                    </pre>
                  </div>
                </details>
                <div className="overflow-hidden rounded border border-border bg-white dark:bg-zinc-900">
                  <Editor
                    value={transformCode}
                    onValueChange={onTransformCodeChange}
                    highlight={highlightJS}
                    padding={10}
                    placeholder="Enter transform function"
                    style={{
                      fontFamily: '"Fira code", "Fira Mono", monospace',
                      fontSize: 14,
                      minHeight: '150px',
                    }}
                  />
                </div>
              </div>

              {/* Test Button */}
              <Button onClick={testTransform} disabled={testLoading} className="w-full">
                <Play className="mr-2 h-4 w-4" />
                Run Test
              </Button>

              {/* Loading */}
              {testLoading && (
                <div className="h-1 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full w-1/3 animate-pulse bg-primary" />
                </div>
              )}
            </div>
          </div>

          {/* Right side - Result */}
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col">
              <h4 className="mb-2 text-sm font-semibold">Result</h4>
              {testResult ? (
                <div className="flex flex-1 flex-col overflow-auto rounded border p-4">
                  {testResult.success ? (
                    <div className="flex flex-1 flex-col">
                      {testResult.noTransform ? (
                        <Alert variant="info" className="mb-4">
                          <Info className="h-4 w-4" />
                          <span>No transform applied - showing base behavior</span>
                        </Alert>
                      ) : (
                        <Alert variant="success" className="mb-4">
                          <CheckCircle className="h-4 w-4" />
                          <span>{functionDocumentation.successMessage}</span>
                        </Alert>
                      )}
                      {onApply && !testResult.noTransform && (
                        <Button onClick={handleApply} className="mb-4">
                          Apply Transform
                        </Button>
                      )}
                      <p className="mb-2 text-xs text-muted-foreground">
                        {functionDocumentation.outputLabel}
                      </p>
                      <div className="flex-1 overflow-auto rounded bg-muted p-4 font-mono text-sm">
                        <Editor
                          value={
                            typeof testResult.result === 'string'
                              ? testResult.result
                              : JSON.stringify(testResult.result, null, 2)
                          }
                          onValueChange={() => {}}
                          highlight={highlightJSON}
                          padding={0}
                          readOnly
                          style={{
                            fontFamily: '"Fira code", "Fira Mono", monospace',
                            fontSize: 14,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span>{testResult.error}</span>
                    </Alert>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded border p-4">
                  <p className="text-center text-muted-foreground">
                    Run the test to see results here
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransformTestDialog;
