import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import type { EvalResultsFilterMode } from '@promptfoo/types';

interface FilterModeSelectorProps {
  filterMode: EvalResultsFilterMode;
  onChange: (value: EvalResultsFilterMode) => void;
  showDifferentOption?: boolean;
}

const BASE_OPTIONS: { value: EvalResultsFilterMode; label: string }[] = [
  { value: 'all', label: 'Show all results' },
  { value: 'failures', label: 'Show failures only' },
  { value: 'passes', label: 'Show passes only' },
  { value: 'errors', label: 'Show errors only' },
  { value: 'different', label: 'Show different outputs' },
  { value: 'highlights', label: 'Show highlights only' },
];

export const FilterModeSelector = ({
  filterMode,
  onChange,
  showDifferentOption = true,
}: FilterModeSelectorProps) => {
  const options = showDifferentOption
    ? BASE_OPTIONS
    : BASE_OPTIONS.filter((o) => o.value !== 'different');

  return (
    <Select value={filterMode} onValueChange={onChange}>
      <SelectTrigger className="min-w-[180px] h-9">
        <SelectValue placeholder="Display" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
