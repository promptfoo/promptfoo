import { useCallback } from 'react';

import { Button } from '@app/components/ui/button';
import { Label } from '@app/components/ui/label';
import { Textarea } from '@app/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { Plus, Trash2 } from 'lucide-react';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

const promptExamples = {
  default: 'You are a helpful assistant. User query: {{ prompt }}',
};

export default function Prompts() {
  const { config, updateConfig } = useRedTeamConfig();

  const addPrompt = () => {
    const newPrompts = [...config.prompts, promptExamples.default];
    updateConfig('prompts', newPrompts);
  };

  const updatePrompt = useCallback(
    (index: number, value: string) => {
      const newPrompts = [...config.prompts];
      newPrompts[index] = value;
      updateConfig('prompts', newPrompts);

      const nonEmptyPrompts = newPrompts.filter((prompt) => prompt.trim() !== '');
      if (nonEmptyPrompts.length === 0) {
        // If all prompts are empty, clear the purpose and entities immediately
        updateConfig('purpose', '');
        updateConfig('entities', []);
      }
    },
    [config.prompts, updateConfig],
  );

  const removePrompt = useCallback(
    (index: number) => {
      const newPrompts = config.prompts.filter((_, i) => i !== index);
      updateConfig('prompts', newPrompts);

      // Check if there are any non-empty prompts left after removal
      const nonEmptyPrompts = newPrompts.filter((prompt) => prompt !== '');
      if (nonEmptyPrompts.length === 0) {
        // Clear the purpose and entities if there are no valid prompts left
        updateConfig('purpose', '');
        updateConfig('entities', []);
      }
    },
    [config.prompts, updateConfig],
  );

  return (
    <div>
      <h2 className="mb-2 text-xl font-medium">Prompts</h2>
      <p className="mb-4 text-muted-foreground">
        Enter your prompts below. Use{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{'{{ prompt }}'}</code> as
        a placeholder where you want the user's input to appear in your prompt template.
      </p>
      {config.prompts.map((prompt, index) => (
        <div key={index} className="mb-4 flex items-start gap-2">
          <div className="flex-1">
            <Label htmlFor={`prompt-${index}`}>
              {config.prompts.length === 1 ? 'Prompt' : `Prompt ${index + 1}`}
            </Label>
            <Textarea
              id={`prompt-${index}`}
              value={prompt}
              onChange={(e) => updatePrompt(index, e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removePrompt(index)}
                className="mt-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove prompt</TooltipContent>
          </Tooltip>
        </div>
      ))}
      <Button variant="outline" onClick={addPrompt}>
        <Plus className="mr-2 size-4" />
        Add Prompt
      </Button>
    </div>
  );
}
