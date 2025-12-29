import { Card, CardContent } from '@app/components/ui/card';
import { Typography } from '@app/components/ui/typography';

interface StepSectionProps {
  stepNumber: number;
  title: string;
  description: string;
  isComplete: boolean;
  isRequired?: boolean;
  count?: number;
  guidance?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function StepSection({
  stepNumber: _stepNumber,
  title,
  description,
  isComplete: _isComplete,
  isRequired: _isRequired = false,
  count: _count,
  guidance,
  children,
  defaultOpen: _defaultOpen = false,
}: StepSectionProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Typography variant="pageTitle" as="h2" weight="bold" className="mb-2">
          {title}
        </Typography>
        <Typography variant="muted">{description}</Typography>
      </div>

      {/* Guidance */}
      {guidance && <div>{guidance}</div>}

      {/* Content */}
      <Card className="bg-white dark:bg-zinc-900 shadow-sm">
        <CardContent className="p-6">{children}</CardContent>
      </Card>
    </div>
  );
}
