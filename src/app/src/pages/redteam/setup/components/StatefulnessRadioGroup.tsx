import { Label } from '@app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@app/components/ui/radio-group';
import { cn } from '@app/lib/utils';

export const STATEFULNESS_QUESTION =
  'Does your system remember the full interaction history (prompts, tool calls, etc.) with each request?';

interface StatefulnessRadioGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export default function StatefulnessRadioGroup({
  value,
  onValueChange,
  disabled,
}: StatefulnessRadioGroupProps) {
  return (
    <RadioGroup value={value} onValueChange={onValueChange} disabled={disabled}>
      <div className="flex items-start gap-2">
        <RadioGroupItem value="true" id="stateful-yes" className="mt-0.5" />
        <Label
          htmlFor="stateful-yes"
          inline
          className={cn('font-normal', disabled && 'cursor-not-allowed opacity-50')}
        >
          <span className="font-bold">Yes</span>
          <span className="text-muted-foreground">
            {
              ' – Promptfoo should only send the current request and assume your system remembers interaction history'
            }
          </span>
        </Label>
      </div>
      <div className="flex items-start gap-2">
        <RadioGroupItem value="false" id="stateful-no" className="mt-0.5" />
        <Label
          htmlFor="stateful-no"
          inline
          className={cn('font-normal', disabled && 'cursor-not-allowed opacity-50')}
        >
          <span className="font-bold">No</span>
          <span className="text-muted-foreground">
            {' – Promptfoo should resend the full interaction history in each request'}
          </span>
        </Label>
      </div>
    </RadioGroup>
  );
}
