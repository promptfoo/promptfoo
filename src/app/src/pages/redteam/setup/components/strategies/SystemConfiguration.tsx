import { Card, CardContent, CardHeader, CardTitle } from '@app/components/ui/card';
import { Label } from '@app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@app/components/ui/radio-group';

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
        <p className="mb-4 text-sm text-muted-foreground">
          Is the target system Stateful? (Does it maintain conversation history?)
        </p>
        <RadioGroup
          value={String(isStatefulValue)}
          onValueChange={(value) => onStatefulChange(value === 'true')}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="true" id="stateful-yes" />
            <Label htmlFor="stateful-yes" inline className="cursor-pointer font-normal">
              Yes - System is stateful, system maintains conversation history.
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="false" id="stateful-no" />
            <Label htmlFor="stateful-no" inline className="cursor-pointer font-normal">
              No - System does not maintain conversation history
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
