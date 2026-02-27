import { Card, CardContent, CardHeader, CardTitle } from '@app/components/ui/card';
import { Checkbox } from '@app/components/ui/checkbox';
import { Label } from '@app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@app/components/ui/radio-group';
import { PRESET_IDS, STRATEGY_PRESETS } from './types';

interface RecommendedOptionsProps {
  isMultiTurnEnabled: boolean;
  isStatefulValue: boolean;
  onMultiTurnChange: (checked: boolean) => void;
  onStatefulChange: (isStateful: boolean) => void;
}

export function RecommendedOptions({
  isMultiTurnEnabled,
  isStatefulValue,
  onMultiTurnChange,
  onStatefulChange,
}: RecommendedOptionsProps) {
  const mediumPreset = STRATEGY_PRESETS[PRESET_IDS.MEDIUM];
  if (!mediumPreset?.options?.multiTurn) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Recommended Options</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2">
            <Checkbox
              id="multi-turn-checkbox"
              checked={isMultiTurnEnabled}
              onCheckedChange={(checked) => onMultiTurnChange(checked === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="multi-turn-checkbox"
              inline
              className="cursor-pointer text-sm font-normal"
            >
              {mediumPreset.options.multiTurn.label}
            </Label>
          </div>

          {isMultiTurnEnabled && (
            <div className="pl-6">
              <p className="mb-1 text-sm font-medium">
                Does your system remember previous interactions?
              </p>
              <p className="mb-3 text-sm text-muted-foreground">
                This decides whether Promptfoo has to resend the full history of interactions
                (prompts, tool calls, etc.) with each request to your system.
              </p>
              <RadioGroup
                value={String(isStatefulValue)}
                onValueChange={(value) => onStatefulChange(value === 'true')}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="true" id="stateful-yes-rec" />
                  <Label
                    htmlFor="stateful-yes-rec"
                    inline
                    className="cursor-pointer text-sm font-normal"
                  >
                    Yes, my system is stateful - Promptfoo will only send the current message and
                    assume interaction history is being managed elsewhere
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="false" id="stateful-no-rec" />
                  <Label
                    htmlFor="stateful-no-rec"
                    inline
                    className="cursor-pointer text-sm font-normal"
                  >
                    No, my system is not stateful - Promptfoo will resend the full history of
                    interactions in each request
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
