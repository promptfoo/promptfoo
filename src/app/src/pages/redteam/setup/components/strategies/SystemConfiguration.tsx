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
        <p className="mb-4 text-sm font-medium">
          Does your system remember the full interaction history (prompts, tool calls, etc.) with
          each request?
        </p>
        <RadioGroup
          value={String(isStatefulValue)}
          onValueChange={(value) => onStatefulChange(value === 'true')}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="true" id="stateful-yes" />
            <Label htmlFor="stateful-yes" inline className="cursor-pointer font-normal">
              Yes – Promptfoo will only send the current request and assume interaction history is
              being managed elsewhere
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="false" id="stateful-no" />
            <Label htmlFor="stateful-no" inline className="cursor-pointer font-normal">
              No – Promptfoo will resend the full interaction history with each request
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
