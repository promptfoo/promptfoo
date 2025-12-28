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
    bg: string;
  }
> = {
  [Severity.Critical]: {
    border: 'border-l-red-800',
    text: 'text-red-800 dark:text-red-400',
    bg: 'bg-red-50/50 dark:bg-red-950/20',
  },
  [Severity.High]: {
    border: 'border-l-red-500',
    text: 'text-red-500 dark:text-red-400',
    bg: 'bg-red-50/50 dark:bg-red-900/20',
  },
  [Severity.Medium]: {
    border: 'border-l-amber-500',
    text: 'text-amber-500 dark:text-amber-400',
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
  },
  [Severity.Low]: {
    border: 'border-l-emerald-500',
    text: 'text-emerald-500 dark:text-emerald-400',
    bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
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
    <CardContent className="flex h-full flex-col items-start justify-center pt-6">
      <h3
        className={cn(
          'mb-1 text-lg font-semibold',
          hasIssues ? styles.text : 'text-muted-foreground',
        )}
      >
        {severityDisplayNames[severity]}
      </h3>
      <span className={cn('text-3xl font-bold', hasIssues ? styles.text : 'text-muted-foreground')}>
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
        'h-full border-l-[5px] transition-all duration-200',
        hasIssues ? styles.border : 'border-l-muted-foreground/50',
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
