import { Card, CardContent, CardHeader, CardTitle } from '@app/components/ui/card';
import StatefulnessRadioGroup, { STATEFULNESS_QUESTION } from '../StatefulnessRadioGroup';

interface SystemConfigurationProps {
  isStatefulValue: boolean;
  onStatefulChange: (val: boolean) => void;
}

export function SystemConfiguration({
  isStatefulValue,
  onStatefulChange,
}: SystemConfigurationProps) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">System Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm font-medium">{STATEFULNESS_QUESTION}</p>
        <StatefulnessRadioGroup
          value={String(isStatefulValue)}
          onValueChange={(value) => onStatefulChange(value === 'true')}
        />
      </CardContent>
    </Card>
  );
}
