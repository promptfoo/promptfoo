import React from 'react';

import { Card, CardContent } from '@app/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { CopyButton } from '@app/components/ui/copy-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { cn } from '@app/lib/utils';
import { ChevronDown } from 'lucide-react';
import type { GradingResult, ResultSuggestion } from '@promptfoo/types';

interface SuggestionsDialogProps {
  open: boolean;
  onClose: () => void;
  gradingResult: GradingResult | undefined;
}

const extractSuggestions = (gradingResult: GradingResult | undefined): ResultSuggestion[] => {
  if (!gradingResult) {
    return [];
  }

  const suggestions: ResultSuggestion[] = [];

  if (gradingResult.suggestions) {
    suggestions.push(...gradingResult.suggestions);
  }

  if (gradingResult.componentResults) {
    gradingResult.componentResults.forEach((componentResult) => {
      if (componentResult.suggestions) {
        suggestions.push(...componentResult.suggestions);
      }
    });
  }

  return suggestions;
};

export default function SuggestionsDialog({
  open,
  onClose,
  gradingResult,
}: SuggestionsDialogProps) {
  const suggestions = extractSuggestions(gradingResult);
  const [expandedItems, setExpandedItems] = React.useState<Record<number, boolean>>({});

  const toggleExpanded = (index: number) => {
    setExpandedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const getActionTitle = (action: string) => {
    switch (action) {
      case 'replace-prompt':
        return 'Modify prompt';
      case 'note':
        return 'Recommendation';
      default:
        return 'Suggestion';
    }
  };

  const getExplanation = (type: string) => {
    if (type === 'datamark') {
      return (
        <p className="mb-4 text-sm text-muted-foreground">
          This suggestion uses a technique known as "spotlighting" or "datamarking" for
          user-generated text, as described in the paper{' '}
          <a
            href="https://arxiv.org/abs/2403.14720"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            "Defending Against Indirect Prompt Injection Attacks With Spotlighting"
          </a>
          . Spotlighting helps improve LLMs' ability to distinguish between multiple sources of
          input.
        </p>
      );
    }
    if (type === 'encoding') {
      return (
        <p className="mb-4 text-sm text-muted-foreground">
          This suggestion uses a base64 encoding technique for user-generated text, as described in
          the paper{' '}
          <a
            href="https://arxiv.org/abs/2403.14720"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            "Defending Against Indirect Prompt Injection Attacks With Spotlighting"
          </a>
          . Encoding helps improve LLMs' ability to distinguish between multiple sources of input.
        </p>
      );
    }
    if (type === 'constitutional-politics') {
      return (
        <p className="mb-4 text-sm text-muted-foreground">
          This suggestion adds a policy statement to the system prompt instructing the assistant to
          avoid expressing political opinions or making political statements. This approach is based
          on strategies from research on{' '}
          <a
            href="https://arxiv.org/abs/2212.08073"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            "Constitutional AI"
          </a>
          , which involves embedding policies directly into prompts to guide assistant behavior.
        </p>
      );
    }
    if (type === 'access-control') {
      return (
        <p className="mb-4 text-sm text-muted-foreground">
          This issue requires enforcing proper access control at the API or application logic layer.
          Prompt modifications alone cannot mitigate Broken Function Level Authorization (BFLA)
          vulnerabilities.
        </p>
      );
    }
    if (type === 'constitutional-imitation') {
      return (
        <p className="mb-4 text-sm text-muted-foreground">
          This suggestion adds a policy statement to the system prompt instructing the assistant to
          avoid imitating or impersonating entities while still allowing factual information. This
          approach is based on strategies from research on{' '}
          <a
            href="https://arxiv.org/abs/2212.08073"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            "Constitutional AI"
          </a>
          , which involves embedding policies directly into prompts to guide assistant behavior.
        </p>
      );
    }
    if (type === 'constitutional-competition') {
      return (
        <p className="mb-4 text-sm text-muted-foreground">
          This suggestion adds a policy statement to the system prompt providing guidelines for
          discussing competitors based on Constitutional AI principles. The policy enforces either
          neutral, factual discussion or complete avoidance of competitor mentions, depending on
          configuration. This approach is based on research on{' '}
          <a
            href="https://arxiv.org/abs/2212.08073"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            "Constitutional AI"
          </a>
          , which involves embedding policies directly into prompts to guide assistant behavior.
        </p>
      );
    }
    if (type === 'constitutional-delegation') {
      return (
        <p className="mb-4 text-sm text-muted-foreground">
          This suggestion adds clear role boundaries and delegation requirements to prevent the
          assistant from making unauthorized commitments or agreements. This approach combines{' '}
          <a
            href="https://arxiv.org/abs/2212.08073"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            "Constitutional AI"
          </a>{' '}
          principles with explicit delegation rules.
        </p>
      );
    }
    if (type === 'structured-validation') {
      return (
        <p className="mb-4 text-sm text-muted-foreground">
          This suggestion implements a structured validation framework based on the
          Chain-of-Verification approach described in{' '}
          <a
            href="https://arxiv.org/abs/2306.00024"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            "Self-Verification Improves Few-Shot Clinical Reasoning"
          </a>
          . This methodology helps prevent overreliance on incorrect assumptions while maintaining
          helpful interactions through systematic verification steps.
        </p>
      );
    }
    if (type === 'constitutional-religion') {
      return (
        <p className="mb-4 text-sm text-muted-foreground">
          This suggestion adds guidelines for maintaining strict neutrality based on the Principle
          of Neutrality described in{' '}
          <a
            href="https://arxiv.org/abs/2310.07521"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            "Constitutional AI: A Survey on Constitutional AI"
          </a>
          . It ensures factual, balanced information while avoiding theological interpretations
          through academically-grounded principles.
        </p>
      );
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Suggestions</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-1">
          {suggestions.map((suggestion, index) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <h3 className="mb-2 text-lg font-semibold">
                  {getActionTitle(suggestion.action || '')}
                </h3>
                {getExplanation(suggestion.type)}
                {suggestion.action === 'note' ? (
                  <p>{suggestion.value}</p>
                ) : (
                  suggestion.action === 'replace-prompt' && (
                    <Collapsible
                      open={expandedItems[index]}
                      onOpenChange={() => toggleExpanded(index)}
                    >
                      <CollapsibleTrigger asChild>
                        <button className="flex w-full items-center justify-between px-1 py-2 text-sm hover:bg-muted/50">
                          <span>View suggested prompt</span>
                          <ChevronDown
                            className={cn(
                              'size-4 transition-transform',
                              expandedItems[index] && 'rotate-180',
                            )}
                          />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="group relative mt-2">
                          <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word rounded bg-muted/50 p-4 pr-12 font-mono text-sm">
                            {suggestion.value}
                          </pre>
                          <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <CopyButton value={suggestion.value} />
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
