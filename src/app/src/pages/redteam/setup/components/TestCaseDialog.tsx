import React, { useMemo, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { NumberInput } from '@app/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Separator } from '@app/components/ui/separator';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useApiHealth } from '@app/hooks/useApiHealth';
import ChatMessages, {
  type LoadedMessage,
  type LoadingMessage,
  type Message,
} from '@app/pages/eval/components/ChatMessages';
import {
  categoryAliases,
  displayNameOverrides,
  isMultiTurnStrategy,
  type Plugin,
  type Strategy,
} from '@promptfoo/redteam/constants';
import { ExternalLink, Info, Sparkles } from 'lucide-react';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';

import type {
  GeneratedTestCase,
  TargetPlugin,
  TargetResponse,
  TargetStrategy,
} from './testCaseGenerationTypes';

interface TestCaseDialogProps {
  open: boolean;
  onClose: () => void;
  plugin: TargetPlugin | null;
  strategy: TargetStrategy | null;
  isGenerating: boolean;
  generatedTestCases: GeneratedTestCase[];
  targetResponses: TargetResponse[];
  isRunningTest?: boolean;
  onRegenerate: (newPluginId?: string) => void;
  onContinue: (additionalTurns: number) => void;
  currentTurn: number;
  maxTurns: number;
  availablePlugins: string[];
  // Whether to allow changing the plugin (only on strategies page)
  allowPluginChange?: boolean;
}

function getPreviewContentType(strategyName: string): LoadedMessage['contentType'] {
  if (strategyName === 'audio') {
    return 'audio';
  }
  if (strategyName === 'image') {
    return 'image';
  }
  if (strategyName === 'video') {
    return 'video';
  }
  return 'text';
}

function getTargetResponseContent(targetResponse: TargetResponse) {
  const output = targetResponse.output;
  if (typeof output === 'string') {
    return output;
  }
  if (output == null) {
    return targetResponse.error ?? 'No response from target';
  }
  return JSON.stringify(output);
}

function buildTurnMessages({
  generatedTestCases,
  targetResponses,
  maxTurns,
  isGenerating,
  isRunningTest,
  strategyName,
}: {
  generatedTestCases: GeneratedTestCase[];
  targetResponses: TargetResponse[];
  maxTurns: number;
  isGenerating: boolean;
  isRunningTest: boolean;
  strategyName: string;
}): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < maxTurns; i++) {
    const generatedTestCase = generatedTestCases[i];
    if (generatedTestCase) {
      messages.push({
        role: 'user',
        content: generatedTestCase.prompt,
        contentType: getPreviewContentType(strategyName),
      } as LoadedMessage);
    }

    const targetResponse = targetResponses[i];
    if (targetResponse) {
      messages.push({
        role: 'assistant',
        content: getTargetResponseContent(targetResponse),
        contentType: 'text',
      } as LoadedMessage);
    }
  }

  if (
    isGenerating &&
    generatedTestCases.length === targetResponses.length &&
    generatedTestCases.length < maxTurns
  ) {
    messages.push({ role: 'user', loading: true } as LoadingMessage);
  } else if (isRunningTest) {
    messages.push({ role: 'assistant', loading: true } as LoadingMessage);
  }
  return messages;
}

export const TestCaseDialog: React.FC<TestCaseDialogProps> = ({
  open,
  onClose,
  plugin,
  strategy,
  isGenerating,
  generatedTestCases,
  targetResponses,
  isRunningTest = false,
  onRegenerate,
  onContinue,
  maxTurns,
  availablePlugins,
  allowPluginChange = false,
}) => {
  const pluginName = plugin?.id ?? '';
  const pluginDisplayName =
    displayNameOverrides[pluginName as Plugin] ||
    categoryAliases[pluginName as Plugin] ||
    pluginName;

  const strategyName = strategy?.id ?? '';
  const strategyDisplayName = displayNameOverrides[strategyName as Strategy] || strategyName;

  const turnMessages = useMemo(
    () =>
      buildTurnMessages({
        generatedTestCases,
        targetResponses,
        maxTurns,
        isGenerating,
        isRunningTest,
        strategyName,
      }),
    [generatedTestCases, targetResponses, maxTurns, isGenerating, isRunningTest, strategyName],
  );

  const canAddAdditionalTurns =
    !isGenerating && !isRunningTest && isMultiTurnStrategy(strategyName as Strategy);

  const renderPluginDocumentationLink =
    pluginName && !plugin?.isStatic && hasSpecificPluginDocumentation(pluginName as Plugin);

  const getDisplayName = (option: string) =>
    (displayNameOverrides as Record<string, string>)[option] ||
    (categoryAliases as Record<string, string>)[option] ||
    option;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="z-[10000] flex max-h-[85vh] flex-col sm:max-w-3xl"
        data-testid="test-case-dialog"
      >
        <DialogHeader className="flex flex-col items-start gap-4 pr-8 sm:flex-row sm:justify-between">
          <div>
            <DialogTitle>
              {allowPluginChange
                ? `${strategyDisplayName}${maxTurns > 1 ? ` (${maxTurns} turns)` : ''}`
                : pluginDisplayName}
            </DialogTitle>
            <p
              className="text-sm text-muted-foreground"
              data-testid={allowPluginChange ? 'strategy-chip' : 'plugin-chip'}
            >
              {allowPluginChange ? 'Strategy Preview' : 'Plugin Preview'}
            </p>
          </div>
          {allowPluginChange && (
            <Select
              value={pluginName}
              onValueChange={(newValue) => {
                if (newValue && newValue !== pluginName) {
                  onRegenerate(newValue);
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-[280px]" data-testid="plugin-dropdown">
                <SelectValue placeholder="Select plugin" />
              </SelectTrigger>
              <SelectContent className="z-[10001]">
                {availablePlugins.map((option) => (
                  <SelectItem key={option} value={option}>
                    {getDisplayName(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </DialogHeader>

        <div className="min-h-[200px] flex-1 space-y-4 overflow-y-auto">
          <div className="max-h-[50vh] overflow-y-auto">
            <ChatMessages
              messages={turnMessages}
              displayTurnCount={maxTurns > 1}
              maxTurns={maxTurns}
            />
          </div>
          {generatedTestCases.length > 0 && (
            <Alert variant="info">
              <Info className="size-4" />
              <AlertContent>
                <AlertDescription>
                  Dissatisfied with the test case? Fine tune it by adjusting your{' '}
                  {pluginName === 'policy' ? 'Policy details' : 'Application Details'}.
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col gap-4 sm:flex-row sm:justify-between">
          {renderPluginDocumentationLink && (
            <a
              href={getPluginDocumentationUrl(pluginName as Plugin)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Learn more about {pluginDisplayName}
              <ExternalLink className="size-3" />
            </a>
          )}

          <div className="flex items-center gap-3">
            {canAddAdditionalTurns && (
              <>
                <MultiTurnExtensionControl onContinue={onContinue} />
                <Separator orientation="vertical" className="h-8" />
              </>
            )}
            <Button
              onClick={() => onRegenerate()}
              variant={canAddAdditionalTurns ? 'outline' : 'default'}
              disabled={isGenerating || isRunningTest}
            >
              {(isGenerating || isRunningTest) && <Spinner size="sm" className="mr-2" />}
              {canAddAdditionalTurns ? 'Start Over' : 'Regenerate'}
            </Button>
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const TestCaseGenerateButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  size?: 'small' | 'medium';
  tooltipTitle?: string;
}> = ({ onClick, disabled = false, isGenerating = false, size = 'small', tooltipTitle }) => {
  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();
  const isRemoteDisabled = apiHealthStatus !== 'connected';

  // Tooltip component uses controlled state in order to imperatively close it when the Test Case
  // Generation dialog is rendered (by default it will remain open even after the dialog is closed).
  const [shouldRenderTooltip, setShouldRenderTooltip] = useState<boolean>(false);

  const showTooltip = () => setShouldRenderTooltip(true);
  const hideTooltip = () => setShouldRenderTooltip(false);

  const iconSize = size === 'small' ? 'h-4 w-4' : 'h-5 w-5';
  const buttonLabel =
    tooltipTitle ||
    (isRemoteDisabled ? 'Requires Promptfoo Cloud connection' : 'Generate a test case');

  return (
    <Tooltip open={shouldRenderTooltip} onOpenChange={setShouldRenderTooltip}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={buttonLabel}
          onClick={(e) => {
            e.stopPropagation();
            hideTooltip();
            onClick();
          }}
          disabled={disabled || isRemoteDisabled}
          className="text-muted-foreground hover:text-foreground"
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
        >
          {isGenerating ? <Spinner size="sm" /> : <Sparkles className={iconSize} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isRemoteDisabled
          ? 'Requires Promptfoo Cloud connection'
          : tooltipTitle || 'Generate test case'}
      </TooltipContent>
    </Tooltip>
  );
};

const MultiTurnExtensionControl: React.FC<{
  onContinue: (additionalTurns: number) => void;
}> = ({ onContinue }) => {
  const [additionalTurns, setAdditionalTurns] = React.useState<number>(5);

  return (
    <div className="flex items-center gap-2">
      <NumberInput
        value={additionalTurns}
        onChange={(value) => {
          if (value !== undefined) {
            setAdditionalTurns(Math.max(1, Math.min(100, value)));
          }
        }}
        className="w-32"
        label="Additional Turns"
        min={1}
        max={100}
      />
      <Button onClick={() => onContinue(additionalTurns)}>Continue</Button>
    </div>
  );
};
