import React from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Spinner } from '@app/components/ui/spinner';
import { Textarea } from '@app/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@app/components/ui/tooltip';
import { Pencil, Play } from 'lucide-react';

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

type CodeDisplayComponent = React.FC<CodeDisplayProps>;

interface PromptEditorProps {
  prompt: string;
  editMode: boolean;
  editedPrompt: string;
  replayLoading: boolean;
  replayError: string | null;
  onEditModeChange: (editMode: boolean) => void;
  onPromptChange: (prompt: string) => void;
  onReplay: () => void;
  onCancel: () => void;
  onCopy: () => void;
  copied: boolean;
  hoveredElement: string | null;
  onMouseEnter: (element: string) => void;
  onMouseLeave: () => void;
  CodeDisplay: CodeDisplayComponent;
  subtitleTypographyClassName: string;
  readOnly?: boolean;
}

export function PromptEditor({
  prompt,
  editMode,
  editedPrompt,
  replayLoading,
  replayError,
  onEditModeChange,
  onPromptChange,
  onReplay,
  onCancel,
  onCopy,
  copied,
  hoveredElement,
  onMouseEnter,
  onMouseLeave,
  CodeDisplay,
  subtitleTypographyClassName,
  readOnly = false,
}: PromptEditorProps) {
  return (
    <TooltipProvider>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className={subtitleTypographyClassName}>Prompt</h4>
          <div className="flex gap-2">
            {!readOnly && !editMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEditModeChange(true)}
                    className="size-8 text-muted-foreground hover:text-primary"
                    aria-label="Edit & Replay"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit & Replay</TooltipContent>
              </Tooltip>
            )}
            {!readOnly && editMode && (
              <>
                <Button
                  size="sm"
                  onClick={onReplay}
                  disabled={replayLoading || !editedPrompt.trim()}
                >
                  {replayLoading ? (
                    <Spinner className="size-4 mr-2" />
                  ) : (
                    <Play className="size-4 mr-2" />
                  )}
                  Replay
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onCancel();
                    onEditModeChange(false);
                    onPromptChange(prompt);
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
        {editMode ? (
          <Textarea
            value={editedPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            className="font-mono text-sm min-h-[100px] max-h-[400px]"
            rows={4}
          />
        ) : (
          <CodeDisplay
            content={prompt}
            title=""
            onCopy={onCopy}
            copied={copied}
            onMouseEnter={() => onMouseEnter('prompt')}
            onMouseLeave={onMouseLeave}
            showCopyButton={hoveredElement === 'prompt' || copied}
          />
        )}
        {replayError && (
          <Alert variant="destructive" className="mt-2">
            <AlertContent>
              <AlertDescription>{replayError}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
      </div>
    </TooltipProvider>
  );
}
