import { cn } from '@app/lib/utils';

interface PresetCardProps {
  name: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}

export default function PresetCard({ name, description, isSelected, onClick }: PresetCardProps) {
  const testId = `preset-card-${name.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'group flex h-full cursor-pointer flex-col items-start justify-start overflow-hidden rounded-lg border p-3 text-left text-card-foreground shadow-sm transition-all print:shadow-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isSelected ? 'border-primary bg-primary/[0.04]' : 'border-border bg-card',
        'hover:-translate-y-0.5 hover:shadow-md',
        isSelected ? 'hover:bg-primary/[0.08]' : 'hover:border-primary/50 hover:bg-primary/5',
      )}
    >
      <span
        className={cn(
          'mb-1 text-sm font-medium transition-colors',
          isSelected ? 'text-primary' : 'text-foreground',
          'group-hover:text-primary',
        )}
      >
        {name}
      </span>

      <span className="line-clamp-2 text-xs leading-snug text-muted-foreground opacity-80">
        {description}
      </span>
    </button>
  );
}
