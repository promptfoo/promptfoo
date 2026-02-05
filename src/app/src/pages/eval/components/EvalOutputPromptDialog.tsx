import { useEffect, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@app/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { HIDDEN_METADATA_KEYS } from '@app/constants';
import { Check, Copy, X } from 'lucide-react';
import ChatMessages, { type Message } from './ChatMessages';
import { DebuggingPanel } from './DebuggingPanel';
import { EvaluationPanel } from './EvaluationPanel';
import { type ExpandedMetadataState, MetadataPanel } from './MetadataPanel';
import { OutputsPanel } from './OutputsPanel';
import { PromptEditor } from './PromptEditor';
import type { GradingResult, Vars } from '@promptfoo/types';

import type { Trace } from '../../../components/traces/TraceView';
import type { CloudConfigData } from '../../../hooks/useCloudConfig';
import type { Citation } from './Citations';
import type { ResultsFilterOperator, ResultsFilterType } from './store';

const subtitleTypographyClassName = 'mb-2 font-medium text-base';

interface RedteamHistoryEntry {
  prompt?: string;
  promptAudio?: { data?: string; format?: string };
  promptImage?: { data?: string; format?: string };
  output?: string;
  outputAudio?: { data?: string; format?: string };
  outputImage?: { data?: string; format?: string };
}

interface CodeDisplayProps {
  content: string;
  title: string;
  maxHeight?: string | number;
  onCopy: () => void;
  copied: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  showCopyButton?: boolean;
}

function CodeDisplay({
  content,
  title,
  maxHeight = 400,
  onCopy,
  copied,
  onMouseEnter,
  onMouseLeave,
  showCopyButton = false,
}: CodeDisplayProps) {
  // Ensure content is a string - handles cases where providers return objects
  const safeContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  // Improved code detection logic
  const isCode =
    /^[\s]*[{[]/.test(safeContent) || // JSON-like (starts with { or [)
    /^#\s/.test(safeContent) || // Markdown headers (starts with # )
    /```/.test(safeContent) || // Code blocks (contains ```)
    /^\s*[\w-]+\s*:/.test(safeContent) || // YAML/config-like (key: value)
    /^\s*<\w+/.test(safeContent) || // XML/HTML-like (starts with <tag)
    safeContent.includes('function ') || // JavaScript functions
    safeContent.includes('class ') || // Class definitions
    safeContent.includes('import ') || // Import statements
    /^\s*def\s+/.test(safeContent) || // Python functions
    /^\s*\w+\s*\(/.test(safeContent); // Function calls

  return (
    <div className="mb-4">
      <h4 className={subtitleTypographyClassName}>{title}</h4>
      <div
        className="relative rounded-lg border border-border bg-muted/30 overflow-hidden transition-colors hover:border-primary/50 hover:bg-muted/50"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div
          className="p-4 overflow-x-auto overflow-y-auto"
          style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
        >
          {isCode ? (
            <pre className="m-0 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
              {safeContent}
            </pre>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words m-0">
              {safeContent}
            </p>
          )}
        </div>
        {showCopyButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCopy}
            className="absolute right-2 top-2 size-8 bg-background shadow-sm hover:shadow"
            aria-label={`Copy ${title.toLowerCase()}`}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Parameters for replaying an evaluation with a modified prompt.
 */
export interface ReplayEvaluationParams {
  evaluationId: string;
  testIndex?: number;
  prompt: string;
  variables?: Vars;
}

/**
 * Result from replaying an evaluation.
 */
export interface ReplayEvaluationResult {
  output?: string;
  error?: string;
}

/**
 * Filter configuration for table filtering.
 */
export interface FilterConfig {
  type: ResultsFilterType;
  operator: ResultsFilterOperator;
  value: string;
  field?: string;
}

interface EvalOutputPromptDialogProps {
  open: boolean;
  onClose: () => void;
  prompt: string;
  provider?: string;
  output?: string;
  gradingResults?: GradingResult[];
  metadata?: Record<string, unknown>;
  /**
   * The actual prompt sent by the provider (if different from the rendered prompt).
   * Takes priority over metadata.redteamFinalPrompt for display purposes.
   */
  providerPrompt?: string;
  evaluationId?: string;
  testCaseId?: string;
  testIndex?: number;
  promptIndex?: number;
  variables?: Vars;
  onAddFilter?: (filter: FilterConfig) => void;
  onResetFilters?: () => void;
  onReplay?: (params: ReplayEvaluationParams) => Promise<ReplayEvaluationResult>;
  fetchTraces?: (evaluationId: string, signal: AbortSignal) => Promise<Trace[]>;
  cloudConfig?: CloudConfigData | null;
  readOnly?: boolean;
}

export default function EvalOutputPromptDialog({
  open,
  onClose,
  prompt,
  provider,
  output,
  gradingResults,
  metadata,
  providerPrompt,
  evaluationId,
  testCaseId,
  testIndex,
  promptIndex,
  variables,
  onAddFilter,
  onResetFilters,
  onReplay,
  fetchTraces,
  cloudConfig,
  readOnly = false,
}: EvalOutputPromptDialogProps) {
  const [activeTab, setActiveTab] = useState('prompt-output');
  const [copied, setCopied] = useState(false);
  const [copiedFields, setCopiedFields] = useState<{ [key: string]: boolean }>({});
  const [expandedMetadata, setExpandedMetadata] = useState<ExpandedMetadataState>({});
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(prompt);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayOutput, setReplayOutput] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);

  useEffect(() => {
    setCopied(false);
    setCopiedFields({});
    setEditMode(false);
    setEditedPrompt(prompt);
    setReplayOutput(null);
    setReplayError(null);
    setActiveTab('prompt-output'); // Reset to first tab when dialog opens
  }, [prompt]);

  // Fetch traces once when evaluationId changes
  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadTraces = async () => {
      if (!evaluationId || !fetchTraces) {
        setTraces([]);
        return;
      }

      try {
        const fetchedTraces = await fetchTraces(evaluationId, controller.signal);
        if (isActive) {
          setTraces(fetchedTraces || []);
        }
      } catch (error) {
        if (isActive && (error as Error).name !== 'AbortError') {
          setTraces([]);
        }
      }
    };

    loadTraces();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [evaluationId, fetchTraces]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const copyFieldToClipboard = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedFields((prev) => ({ ...prev, [key]: true }));

    setTimeout(() => {
      setCopiedFields((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  const handleReplay = async () => {
    if (!evaluationId || !provider) {
      setReplayError('Missing evaluation ID or provider');
      return;
    }

    if (!onReplay) {
      setReplayError('Replay functionality is not available');
      return;
    }

    setReplayLoading(true);
    setReplayError(null);
    setReplayOutput(null);

    try {
      const result = await onReplay({
        evaluationId,
        testIndex,
        prompt: editedPrompt,
        variables,
      });

      if (result.error) {
        setReplayError(result.error);
      } else if (result.output) {
        setReplayOutput(result.output);
      } else {
        setReplayOutput('(No output returned)');
      }
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setReplayLoading(false);
    }
  };

  const handleMetadataClick = (key: string) => {
    const now = Date.now();
    const lastClick = expandedMetadata[key]?.lastClickTime || 0;
    const isDoubleClick = now - lastClick < 300; // 300ms threshold

    setExpandedMetadata((prev: ExpandedMetadataState) => ({
      ...prev,
      [key]: {
        expanded: !isDoubleClick,
        lastClickTime: now,
      },
    }));
  };

  const handleApplyFilter = (
    field: string,
    value: string,
    operator: 'equals' | 'contains' = 'equals',
  ) => {
    onResetFilters?.();
    onAddFilter?.({
      type: 'metadata',
      operator,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      field,
    });
    onClose();
  };

  const handleCancel = () => {
    setEditedPrompt(prompt);
    setReplayOutput(null);
    setReplayError(null);
  };

  let parsedMessages: Message[] = [];
  try {
    const messagesValue = metadata?.messages;
    parsedMessages = JSON.parse(typeof messagesValue === 'string' ? messagesValue : '[]');
  } catch {}

  const citationsData = metadata?.citations as Citation | Citation[] | undefined;

  const hasOutputContent = Boolean(
    output || replayOutput || metadata?.redteamFinalPrompt || citationsData,
  );

  const redteamHistoryRaw = (metadata?.redteamHistory || metadata?.redteamTreeHistory || []) as
    | RedteamHistoryEntry[]
    | unknown[];
  const redteamHistoryMessages = (Array.isArray(redteamHistoryRaw) ? redteamHistoryRaw : [])
    .filter((entry): entry is RedteamHistoryEntry => {
      const e = entry as RedteamHistoryEntry;
      return Boolean(e?.prompt && e?.output);
    })
    .flatMap((entry: RedteamHistoryEntry) => [
      {
        role: 'user' as const,
        content: entry.prompt!,
        audio: entry.promptAudio,
        image: entry.promptImage,
      },
      {
        role: 'assistant' as const,
        content: entry.output!,
        audio: entry.outputAudio,
        image: entry.outputImage,
      },
    ]);

  const hasEvaluationData = gradingResults && gradingResults.length > 0;
  const hasMessagesData = parsedMessages.length > 0 || redteamHistoryMessages.length > 0;
  const hasMetadata =
    metadata &&
    Object.keys(metadata).filter((key) => !HIDDEN_METADATA_KEYS.includes(key)).length > 0;

  const visibleTabs: string[] = ['prompt-output'];
  if (hasEvaluationData) {
    visibleTabs.push('evaluation');
  }
  if (hasMessagesData) {
    visibleTabs.push('messages');
  }
  if (hasMetadata) {
    visibleTabs.push('metadata');
  }

  // Show traces tab only when there's actual trace data
  const hasTracesData = traces.length > 0;

  if (hasTracesData) {
    visibleTabs.push('traces');
  }

  // Ensure active tab is valid, fallback to first tab if not
  const currentTab = visibleTabs.includes(activeTab) ? activeTab : 'prompt-output';

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:w-[85vw] sm:max-w-none p-0 gap-0 flex flex-col"
        hideCloseButton
      >
        {/* Header with title and close button */}
        <SheetHeader className="flex flex-row items-center justify-between p-4 border-b border-border space-y-0">
          <SheetTitle>Details{provider && `: ${provider}`}</SheetTitle>
          <SheetDescription className="sr-only">
            View prompt, output, evaluation results, and metadata details
          </SheetDescription>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="close"
            className="size-8 ml-2"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        {/* Main content area with tabs */}
        <Tabs
          value={currentTab}
          onValueChange={setActiveTab}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-4 h-auto py-0">
            <TabsTrigger
              value="prompt-output"
              className="-mb-px rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
            >
              {hasOutputContent ? 'Prompt & Output' : 'Prompt'}
            </TabsTrigger>
            {hasEvaluationData && (
              <TabsTrigger
                value="evaluation"
                className="-mb-px rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
              >
                Evaluation
              </TabsTrigger>
            )}
            {hasMessagesData && (
              <TabsTrigger
                value="messages"
                className="-mb-px rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
              >
                Messages
              </TabsTrigger>
            )}
            {hasMetadata && (
              <TabsTrigger
                value="metadata"
                className="-mb-px rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
              >
                Metadata
              </TabsTrigger>
            )}
            {hasTracesData && (
              <TabsTrigger
                value="traces"
                className="-mb-px rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
              >
                Traces
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab Panels Container */}
          <div className="flex-1 overflow-auto p-4">
            {/* Prompt & Output Panel */}
            <TabsContent value="prompt-output" className="mt-0">
              <PromptEditor
                prompt={prompt}
                editMode={editMode}
                editedPrompt={editedPrompt}
                replayLoading={replayLoading}
                replayError={replayError}
                onEditModeChange={setEditMode}
                onPromptChange={setEditedPrompt}
                onReplay={handleReplay}
                onCancel={handleCancel}
                onCopy={() => copyToClipboard(prompt)}
                copied={copied}
                hoveredElement={hoveredElement}
                onMouseEnter={setHoveredElement}
                onMouseLeave={() => setHoveredElement(null)}
                CodeDisplay={CodeDisplay}
                subtitleTypographyClassName={subtitleTypographyClassName}
                readOnly={readOnly}
              />
              {hasOutputContent && (
                <OutputsPanel
                  output={output}
                  replayOutput={replayOutput}
                  providerPrompt={providerPrompt}
                  redteamFinalPrompt={
                    typeof metadata?.redteamFinalPrompt === 'string'
                      ? metadata.redteamFinalPrompt
                      : undefined
                  }
                  copiedFields={copiedFields}
                  hoveredElement={hoveredElement}
                  onCopy={copyFieldToClipboard}
                  onMouseEnter={setHoveredElement}
                  onMouseLeave={() => setHoveredElement(null)}
                  CodeDisplay={CodeDisplay}
                  citations={citationsData}
                />
              )}
            </TabsContent>

            {/* Evaluation Panel */}
            {hasEvaluationData && (
              <TabsContent value="evaluation" className="mt-0">
                <EvaluationPanel gradingResults={gradingResults} />
              </TabsContent>
            )}

            {/* Messages Panel */}
            {hasMessagesData && (
              <TabsContent value="messages" className="mt-0">
                {parsedMessages.length > 0 && <ChatMessages messages={parsedMessages} />}
                {redteamHistoryMessages.length > 0 && (
                  <div className={parsedMessages.length > 0 ? 'mt-6' : ''}>
                    <ChatMessages messages={redteamHistoryMessages} />
                  </div>
                )}
              </TabsContent>
            )}

            {/* Metadata Panel */}
            {hasMetadata && (
              <TabsContent value="metadata" className="mt-0">
                <MetadataPanel
                  metadata={metadata}
                  expandedMetadata={expandedMetadata}
                  copiedFields={copiedFields}
                  onMetadataClick={handleMetadataClick}
                  onCopy={copyFieldToClipboard}
                  onApplyFilter={handleApplyFilter}
                  cloudConfig={cloudConfig}
                />
              </TabsContent>
            )}

            {/* Traces Panel */}
            {hasTracesData && (
              <TabsContent value="traces" className="mt-0">
                <DebuggingPanel
                  evaluationId={evaluationId}
                  testCaseId={testCaseId}
                  testIndex={testIndex}
                  promptIndex={promptIndex}
                  traces={traces}
                />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
