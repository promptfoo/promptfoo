import { Card, CardContent } from '@app/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Severity, severityDisplayNames } from '@promptfoo/redteam/constants';

interface SeverityCardProps {
  severity: Severity;
  issueCount?: number;
  navigateOnClick: boolean;
  navigateToIssues: (props: { severity: Severity }) => void;
  isActive?: boolean;
  hasActiveFilter?: boolean;
}

// Maps severity to Tailwind color classes
const severityStyles: Record<
  Severity,
  {
    border: string;
    text: string;
    numberText: string;
    bg: string;
    accent: string;
  }
> = {
  [Severity.Critical]: {
    border: 'border-l-red-800',
    text: 'text-red-700 dark:text-red-400',
    numberText: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50/50 dark:bg-red-950/20',
    accent: 'bg-red-800',
  },
  [Severity.High]: {
    border: 'border-l-red-500',
    text: 'text-red-700 dark:text-red-400',
    numberText: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50/50 dark:bg-red-900/20',
    accent: 'bg-red-500',
  },
  [Severity.Medium]: {
    border: 'border-l-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    numberText: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    accent: 'bg-amber-500',
  },
  [Severity.Low]: {
    border: 'border-l-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    numberText: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
    accent: 'bg-emerald-500',
  },
  [Severity.Informational]: {
    border: 'border-l-blue-500',
    text: 'text-blue-700 dark:text-blue-400',
    numberText: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
    accent: 'bg-blue-500',
  },
};

export default function SeverityCard({
  severity,
  issueCount = 0,
  navigateOnClick,
  navigateToIssues,
  isActive = false,
  hasActiveFilter = false,
}: SeverityCardProps) {
  const hasIssues = issueCount > 0;
  const styles = severityStyles[severity];

  // De-emphasize inactive cards when a filter is active
  const isInactive = hasActiveFilter && !isActive;

  const content = (
    <CardContent className="flex h-full flex-col items-start justify-center pl-5 pt-6">
      <h3
        className={cn(
          'mb-1 text-lg font-semibold',
          hasIssues ? styles.text : 'text-muted-foreground',
        )}
      >
        {severityDisplayNames[severity]}
      </h3>
      <span
        className={cn(
          'text-3xl font-bold',
          hasIssues ? styles.numberText : 'text-muted-foreground',
        )}
      >
        {issueCount}
      </span>
      <span className={cn('text-sm', hasIssues ? styles.text : 'text-muted-foreground')}>
        {issueCount === 1 ? 'Vulnerability' : 'Vulnerabilities'}
      </span>
    </CardContent>
  );

  const cardContent = (
    <Card
      className={cn(
        'relative h-full overflow-hidden transition-all duration-200',
        hasIssues ? styles.bg : 'bg-transparent grayscale-[0.5]',
        isInactive && 'opacity-40',
        navigateOnClick &&
          hasIssues &&
          'cursor-pointer hover:-translate-y-1 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      onClick={navigateOnClick && hasIssues ? () => navigateToIssues({ severity }) : undefined}
      role={navigateOnClick && hasIssues ? 'button' : undefined}
      tabIndex={navigateOnClick && hasIssues ? 0 : undefined}
      aria-label={
        navigateOnClick && hasIssues
          ? isActive
            ? `Clear ${severityDisplayNames[severity]} filter`
            : `Filter by ${severityDisplayNames[severity]} vulnerabilities`
          : undefined
      }
      onKeyDown={
        navigateOnClick && hasIssues
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigateToIssues({ severity });
              }
            }
          : undefined
      }
    >
      <div
        className={cn(
          'absolute left-0 top-0 h-full w-1.5',
          hasIssues ? styles.accent : 'bg-muted-foreground/30',
        )}
      />
      {content}
    </Card>
  );

  // Wrap clickable cards with tooltip
  if (navigateOnClick && hasIssues) {
    const tooltipTitle = isActive ? 'Click to clear filter' : 'Click to filter';
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
        <TooltipContent>{tooltipTitle}</TooltipContent>
      </Tooltip>
    );
  }

  return cardContent;
}
