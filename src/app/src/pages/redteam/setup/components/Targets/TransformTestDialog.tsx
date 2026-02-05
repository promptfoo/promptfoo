import React from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Label } from '@app/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { AlertCircle, AlignLeft, CheckCircle, ChevronDown, Code2, Info, Play } from 'lucide-react';
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
    result?: unknown;
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
    const grammar = Prism?.languages?.javascript;
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
    const grammar = Prism?.languages?.json;
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
    result?: unknown;
    error?: string;
    noTransform?: boolean;
  } | null>(null);
  const [testInputExpanded, setTestInputExpanded] = React.useState(true);
  const [docsExpanded, setDocsExpanded] = React.useState(false);
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
      <DialogContent className="flex h-[85vh] max-w-6xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="size-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Test and apply transform functions to modify input/output behavior
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-0 overflow-hidden md:flex-row">
          {/* Left side - Input */}
          <div className="flex flex-[0_0_58%] flex-col border-r border-border">
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              {/* Test Input Section */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">{testInputLabel}</Label>
                <Collapsible
                  open={testInputExpanded}
                  onOpenChange={setTestInputExpanded}
                  className="rounded-lg border border-border"
                >
                  <div className="flex items-center justify-between rounded-t-lg bg-muted/50 px-3 py-2">
                    <CollapsibleTrigger className="flex flex-1 items-center justify-between text-left transition-colors hover:text-foreground">
                      <span className="text-sm text-muted-foreground">Test input</span>
                      <ChevronDown
                        className={cn(
                          'size-4 text-muted-foreground transition-transform',
                          testInputExpanded && 'rotate-180',
                        )}
                      />
                    </CollapsibleTrigger>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="Format JSON"
                          className="ml-2 rounded p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                          onClick={formatJson}
                        >
                          <AlignLeft className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Format JSON</TooltipContent>
                    </Tooltip>
                  </div>
                  <CollapsibleContent>
                    {formatError && (
                      <Alert variant="destructive" className="m-3 mb-0">
                        <AlertCircle className="size-4" />
                        <AlertContent>
                          <AlertDescription>{formatError}</AlertDescription>
                        </AlertContent>
                      </Alert>
                    )}
                    <div className="border-t border-border bg-white dark:bg-zinc-950">
                      <Editor
                        value={testInput}
                        onValueChange={onTestInputChange}
                        highlight={highlightJSON}
                        padding={12}
                        placeholder={testInputPlaceholder}
                        className="text-sm"
                        style={{
                          fontFamily: 'ui-monospace, "Fira Code", monospace',
                          fontSize: 13,
                          minHeight: `${testInputRows * 24}px`,
                        }}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Transform Code Editor Section */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Transform Function</Label>

                {/* Documentation Collapsible */}
                <Collapsible
                  open={docsExpanded}
                  onOpenChange={setDocsExpanded}
                  className="rounded-lg border border-border"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted data-[state=open]:rounded-b-none">
                    <span className="text-sm text-muted-foreground">Documentation</span>
                    <ChevronDown
                      className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        docsExpanded && 'rotate-180',
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-3 border-t border-border p-3">
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Function Signature
                        </p>
                        <code className="block rounded bg-muted px-2 py-1.5 font-mono text-xs">
                          {functionDocumentation.signature}
                        </code>
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Parameters & Return
                        </p>
                        <div className="text-sm leading-relaxed text-muted-foreground">
                          {functionDocumentation.description}
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Code Editor */}
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">JavaScript</span>
                  </div>
                  <div className="bg-white dark:bg-zinc-950">
                    <Editor
                      value={transformCode}
                      onValueChange={onTransformCodeChange}
                      highlight={highlightJS}
                      padding={12}
                      placeholder="// Enter your transform function here"
                      style={{
                        fontFamily: 'ui-monospace, "Fira Code", monospace',
                        fontSize: 13,
                        minHeight: '150px',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Test Button */}
              <Button onClick={testTransform} disabled={testLoading} size="lg" className="w-full">
                <Play className="mr-2 size-4" />
                Run Test
              </Button>

              {/* Loading */}
              {testLoading && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/3 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-primary" />
                </div>
              )}
            </div>
          </div>

          {/* Right side - Result */}
          <div className="flex flex-1 flex-col bg-muted/30">
            <div className="flex flex-1 flex-col p-4">
              <Label className="mb-2 text-sm font-semibold">Result</Label>
              {testResult ? (
                <div className="flex flex-1 flex-col overflow-auto rounded-lg border border-border bg-card p-4">
                  {testResult.success ? (
                    <div className="flex flex-1 flex-col">
                      {testResult.noTransform ? (
                        <Alert variant="info" className="mb-4">
                          <Info className="size-4" />
                          <AlertContent>
                            <AlertDescription>
                              No transform applied - showing base behavior
                            </AlertDescription>
                          </AlertContent>
                        </Alert>
                      ) : (
                        <Alert variant="success" className="mb-4">
                          <CheckCircle className="size-4" />
                          <AlertContent>
                            <AlertDescription>
                              {functionDocumentation.successMessage}
                            </AlertDescription>
                          </AlertContent>
                        </Alert>
                      )}
                      {onApply && !testResult.noTransform && (
                        <Button onClick={handleApply} className="mb-4">
                          Apply Transform
                        </Button>
                      )}
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {functionDocumentation.outputLabel}
                      </p>
                      <div className="flex-1 overflow-auto rounded-lg border border-border bg-white p-3 dark:bg-zinc-950">
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
                            fontFamily: 'ui-monospace, "Fira Code", monospace',
                            fontSize: 13,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="size-4" />
                      <AlertContent>
                        <AlertDescription>{testResult.error}</AlertDescription>
                      </AlertContent>
                    </Alert>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-card p-4">
                  <div className="text-center">
                    <Play className="mx-auto mb-2 size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">Run the test to see results</p>
                  </div>
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
