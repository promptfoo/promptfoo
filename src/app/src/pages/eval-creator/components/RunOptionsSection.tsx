import { Card } from '@app/components/ui/card';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import RunTestSuiteButton from './RunTestSuiteButton';

interface RunOptionsSectionProps {
  description?: string;
  delay?: number;
  maxConcurrency?: number;
  onChange: (options: { description?: string; delay?: number; maxConcurrency?: number }) => void;
  isReadyToRun?: boolean;
}

export function RunOptionsSection({
  description,
  delay,
  maxConcurrency,
  onChange,
  isReadyToRun = false,
}: RunOptionsSectionProps) {
  const canSetDelay = !maxConcurrency || maxConcurrency === 1;
  const canSetMaxConcurrency = !delay || delay === 0;

  const handleDelayChange = (value: string) => {
    const parsed = value === '' ? undefined : Number(value);
    const safe = parsed !== undefined && (Number.isNaN(parsed) || parsed < 0) ? 0 : parsed;
    onChange({
      description,
      delay: safe,
      maxConcurrency: safe && safe > 0 ? 1 : maxConcurrency,
    });
  };

  const handleMaxConcurrencyChange = (value: string) => {
    const parsed = value === '' ? undefined : Number(value);
    const safe = parsed !== undefined && (Number.isNaN(parsed) || parsed < 1) ? 1 : parsed;
    onChange({
      description,
      delay: safe && safe > 1 ? 0 : delay,
      maxConcurrency: safe,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-muted/30 border-dashed">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Evaluation name / description</Label>
            <Input
              id="description"
              placeholder="e.g., GPT-4 vs Claude comparison for customer support prompts"
              value={description || ''}
              onChange={(e) => onChange({ description: e.target.value, delay, maxConcurrency })}
            />
            <p className="text-xs text-muted-foreground">
              Optional description to help identify this evaluation later
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delay" className={canSetDelay ? '' : 'text-muted-foreground'}>
              Delay between API calls (ms)
            </Label>
            <Input
              id="delay"
              type="number"
              min="0"
              placeholder="0"
              value={delay?.toString() || ''}
              onChange={(e) => handleDelayChange(e.target.value)}
              disabled={!canSetDelay}
            />
            <p className="text-xs text-muted-foreground">
              {canSetDelay
                ? 'Add a delay between API calls to avoid rate limits'
                : 'To set a delay, max concurrent requests must be 1'}
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="maxConcurrency"
              className={canSetMaxConcurrency ? '' : 'text-muted-foreground'}
            >
              Max concurrent requests
            </Label>
            <Input
              id="maxConcurrency"
              type="number"
              min="1"
              placeholder="4"
              value={maxConcurrency?.toString() || ''}
              onChange={(e) => handleMaxConcurrencyChange(e.target.value)}
              disabled={!canSetMaxConcurrency}
            />
            <p className="text-xs text-muted-foreground">
              {canSetMaxConcurrency
                ? 'Maximum number of concurrent requests to make'
                : 'To set max concurrency, delay must be 0'}
            </p>
          </div>
        </div>
      </Card>

      <p className="text-sm text-muted-foreground">
        These settings apply to all providers in this evaluation. Note: Delay and max concurrency
        are mutually exclusive.
      </p>

      {/* Run Evaluation Section */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Ready to run your evaluation?</h3>
            <p className="text-sm text-muted-foreground">
              {isReadyToRun
                ? 'All required steps are complete. Click below to start your evaluation.'
                : 'Complete the required steps (Providers, Prompts, Test Cases) to run your evaluation.'}
            </p>
          </div>

          <RunTestSuiteButton />
        </div>
      </Card>
    </div>
  );
}
