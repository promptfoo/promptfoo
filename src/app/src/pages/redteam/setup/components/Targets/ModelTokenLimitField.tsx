import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';

interface ModelTokenLimitFieldProps {
  label: string;
  min: number;
  value?: number | string | null;
  onChange: (value: number | undefined) => void;
}

export default function ModelTokenLimitField({
  label,
  min,
  value,
  onChange,
}: ModelTokenLimitFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="max-tokens">{label}</Label>
      <Input
        id="max-tokens"
        type="number"
        min={min}
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : parseInt(event.target.value, 10))
        }
      />
      <p className="text-sm text-muted-foreground">Maximum number of tokens to generate</p>
    </div>
  );
}
