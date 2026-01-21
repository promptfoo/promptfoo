import { Card, CardContent } from '@app/components/ui/card';
import { cn } from '@app/lib/utils';
import { useStore } from '@app/stores/evalConfig';
import { Check, Circle } from 'lucide-react';

interface Step {
  id: string;
  label: string;
  required: boolean;
}

const steps: Step[] = [
  { id: 'providers', label: 'Providers', required: true },
  { id: 'prompts', label: 'Prompts', required: true },
  { id: 'tests', label: 'Test Cases', required: true },
];

export function ProgressIndicator() {
  const { config } = useStore();

  const isStepComplete = (stepId: string): boolean => {
    switch (stepId) {
      case 'providers':
        return Array.isArray(config.providers) && config.providers.length > 0;
      case 'prompts':
        return Array.isArray(config.prompts) && config.prompts.length > 0;
      case 'tests':
        return Array.isArray(config.tests) && config.tests.length > 0;
      default:
        return false;
    }
  };

  return (
    <Card className="bg-white dark:bg-zinc-900 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isComplete = isStepComplete(step.id);
            const isLast = index === steps.length - 1;

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      'flex items-center justify-center size-10 rounded-full border-2 transition-all',
                      isComplete
                        ? 'bg-emerald-100 border-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-400'
                        : 'bg-white border-border dark:bg-zinc-900',
                    )}
                  >
                    {isComplete ? (
                      <Check className="size-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isComplete
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-muted-foreground',
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                {!isLast && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-4 transition-all',
                      isComplete ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-border',
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
