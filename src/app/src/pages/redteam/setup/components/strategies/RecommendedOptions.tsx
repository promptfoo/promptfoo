import { Card, CardContent, CardHeader, CardTitle } from '@app/components/ui/card';
import { Checkbox } from '@app/components/ui/checkbox';
import { Label } from '@app/components/ui/label';
import StatefulnessRadioGroup, { STATEFULNESS_QUESTION } from '../StatefulnessRadioGroup';
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
              <p className="mb-3 text-sm font-medium">{STATEFULNESS_QUESTION}</p>
              <StatefulnessRadioGroup
                value={String(isStatefulValue)}
                onValueChange={(value) => onStatefulChange(value === 'true')}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
