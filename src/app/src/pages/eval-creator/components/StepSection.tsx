import { useId } from 'react';

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
}: StepSectionProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 lg:gap-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Step {stepNumber}</span>
          <span aria-hidden="true">/</span>
          <span>{isRequired ? 'Required' : 'Optional'}</span>
          {isComplete && (
            <>
              <span aria-hidden="true">/</span>
              <span>{count === undefined ? 'Configured' : `${count} configured`}</span>
            </>
          )}
        </div>
        <Typography id={titleId} variant="pageTitle" as="h2" weight="bold" className="mb-2">
          {title}
        </Typography>
        <Typography variant="muted">{description}</Typography>
      </div>

      {/* Content */}
      <div className="min-w-0">{children}</div>

      {/* Guidance */}
      {guidance && <div>{guidance}</div>}
    </section>
  );
}
