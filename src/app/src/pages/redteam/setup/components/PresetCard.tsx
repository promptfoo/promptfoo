import { Card } from '@app/components/ui/card';
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
    <Card
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'group flex h-full cursor-pointer flex-col items-start justify-start overflow-hidden p-5 transition-all',
        isSelected ? 'border-primary bg-primary/[0.04]' : 'border-border bg-background',
        'hover:-translate-y-0.5 hover:shadow-lg',
        isSelected ? 'hover:bg-primary/[0.08]' : 'hover:bg-muted/30',
      )}
    >
      <h3
        className={cn(
          'mb-3 text-lg font-medium transition-colors',
          isSelected ? 'text-primary' : 'text-foreground',
          'group-hover:text-primary',
        )}
      >
        {name}
      </h3>

      <p className="text-sm leading-relaxed text-muted-foreground opacity-80">{description}</p>
    </Card>
  );
}
