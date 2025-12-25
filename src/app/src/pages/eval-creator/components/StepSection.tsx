import { Card, CardContent, CardHeader } from '@app/components/ui/card';

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
  stepNumber,
  title,
  description,
  isComplete,
  isRequired = false,
  count,
  guidance,
  children,
  defaultOpen = false,
}: StepSectionProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
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
