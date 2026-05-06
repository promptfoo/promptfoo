import { useId } from 'react';

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
        <h2 id={titleId} className="mb-2 text-2xl font-bold">
          {title}
        </h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      {/* Content */}
      <div className="min-w-0">{children}</div>

      {/* Guidance */}
      {guidance && <div>{guidance}</div>}
    </section>
  );
}
