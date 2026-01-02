import React from 'react';

import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { Plus, Sparkles, ThumbsDown } from 'lucide-react';
import type { PolicyObject } from '@promptfoo/redteam/types';

type PolicySuggestionsSidebarProps = {
  isGeneratingPolicies: boolean;
  suggestedPolicies: PolicyObject[];
  onGeneratePolicies: () => void;
  onAddSuggestedPolicy: (policy: PolicyObject) => void;
  onRemoveSuggestedPolicy: (policy: PolicyObject) => void;
};

export const PolicySuggestionsSidebar: React.FC<PolicySuggestionsSidebarProps> = ({
  isGeneratingPolicies,
  suggestedPolicies,
  onGeneratePolicies,
  onAddSuggestedPolicy,
  onRemoveSuggestedPolicy,
}) => {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
      {/* Header - fixed */}
      <div className="shrink-0 border-b bg-muted/50 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-muted-foreground" />
          <h3 className="font-semibold">Suggested Policies</h3>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-auto p-4">
        {/* Show generate button when not generating and no suggestions */}
        {!isGeneratingPolicies && suggestedPolicies.length === 0 && (
          <div className="px-2 py-8">
            <p className="mb-4 text-center text-sm text-muted-foreground">
              Generate AI-powered policy suggestions based on your application.
            </p>
            <Button className="w-full" onClick={onGeneratePolicies} disabled={isGeneratingPolicies}>
              <Sparkles className="mr-2 size-4" />
              Generate Suggestions
            </Button>
          </div>
        )}

        {isGeneratingPolicies && suggestedPolicies.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Spinner className="size-8" />
            <p className="text-center text-sm text-muted-foreground">
              Analyzing your application to generate relevant policies...
            </p>
          </div>
        )}

        {suggestedPolicies.length > 0 && (
          <div className="flex flex-col gap-3">
            {suggestedPolicies.map((policy, index) => (
              <Card
                key={index}
                className="cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                onClick={() => onAddSuggestedPolicy(policy)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <Plus className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="flex-1">
                      <h4 className="mb-1 font-semibold">{policy.name}</h4>
                      <p className="text-sm leading-relaxed text-muted-foreground">{policy.text}</p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveSuggestedPolicy(policy);
                          }}
                        >
                          <ThumbsDown className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Dismiss suggestion</TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
