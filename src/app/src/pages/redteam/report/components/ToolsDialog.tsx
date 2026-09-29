import { useEffect, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { callApi } from '@app/utils/api';
import { isProviderOptions, type SharedResults } from '@promptfoo/types';

export interface Tool {
  type: string;
  function?: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

interface ToolsDialogProps {
  open: boolean;
  onClose: () => void;
  evalId: string;
}

const ToolsDialog = ({ open, onClose, evalId }: ToolsDialogProps) => {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry reloads the selected evaluation.
  useEffect(() => {
    if (!open) {
      return;
    }
    const controller = new AbortController();
    setTools(null);
    setError(false);
    void (async () => {
      try {
        const response = await callApi(
          `/results/${encodeURIComponent(evalId)}?includeTraces=false`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error('Unable to load tools');
        }
        const { data } = (await response.json()) as SharedResults;
        const provider = Array.isArray(data.config.providers)
          ? data.config.providers[0]
          : undefined;
        const configured = isProviderOptions(provider) ? provider.config?.tools : undefined;
        if (!controller.signal.aborted) {
          setTools(configured ? (Array.isArray(configured) ? configured : [configured]) : []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
        }
      }
    })();
    return () => controller.abort();
  }, [open, evalId, attempt]);
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Available Tools</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {error ? (
            <div role="alert">
              Unable to load tools.{' '}
              <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                Retry
              </Button>
            </div>
          ) : tools === null ? (
            <p role="status">Loading tools...</p>
          ) : tools.length === 0 ? (
            <p>No tools are configured.</p>
          ) : null}
          <ul className="space-y-4">
            {tools?.map((tool, index) => (
              <li
                key={tool.function?.name ?? index}
                className="border-b border-border pb-4 last:border-0"
              >
                {tool?.type === 'function' && tool.function ? (
                  <div>
                    <h4 className="font-medium text-foreground">{tool.function.name}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tool.function.description}
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                      {JSON.stringify(tool.function.parameters, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-medium text-foreground">Unknown Tool Type</h4>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                      {JSON.stringify(tool, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ToolsDialog;
