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
  defaultOpen: _defaultOpen = false,
}: StepSectionProps) {
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
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
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      {/* Guidance */}
      {guidance && <div className="order-3 lg:order-2">{guidance}</div>}

      {/* Content */}
      <div className="order-2 min-w-0 lg:order-3">{children}</div>
    </div>
  );
}
