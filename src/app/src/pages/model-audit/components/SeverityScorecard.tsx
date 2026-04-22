import { cn } from '@app/lib/utils';

import type { SeverityCounts } from '../hooks';

interface SeverityScorecardProps {
  counts: SeverityCounts;
  size?: 'sm' | 'default';
}

interface MetricCardProps {
  count: number;
  label: string;
  colorScheme: 'red' | 'amber' | 'blue';
  size: 'sm' | 'default';
}

const colorStyles = {
  red: {
    active: 'bg-red-100 border border-red-200/60 dark:bg-red-900/50 dark:border-red-700/50',
    countActive: 'text-red-700 dark:text-red-300',
    labelActive: 'text-red-600 dark:text-red-400',
  },
  amber: {
    active: 'bg-amber-100 border border-amber-200/60 dark:bg-amber-900/50 dark:border-amber-700/50',
    countActive: 'text-amber-700 dark:text-amber-300',
    labelActive: 'text-amber-600 dark:text-amber-400',
  },
  blue: {
    active: 'bg-blue-100 border border-blue-200/60 dark:bg-blue-900/50 dark:border-blue-700/50',
    countActive: 'text-blue-700 dark:text-blue-300',
    labelActive: 'text-blue-600 dark:text-blue-400',
  },
};

function MetricCard({ count, label, colorScheme, size }: MetricCardProps) {
  const isActive = count > 0;
  const colors = colorStyles[colorScheme];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl w-20',
        size === 'sm' ? 'px-4 py-2' : 'px-4 py-3',
        isActive ? colors.active : 'bg-white/60 shadow-sm dark:bg-white/10',
      )}
    >
      <span
        className={cn(
          'font-bold tabular-nums',
          size === 'sm' ? 'text-xl' : 'text-2xl',
          isActive ? colors.countActive : 'text-muted-foreground',
        )}
      >
        {count}
      </span>
      <span
        className={cn(
          'text-xs font-medium uppercase tracking-wide',
          isActive ? colors.labelActive : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}

export default function SeverityScorecard({ counts, size = 'default' }: SeverityScorecardProps) {
  return (
    <div className={cn('flex', size === 'sm' ? 'gap-3' : 'gap-3 lg:gap-4')}>
      <MetricCard count={counts.critical} label="Critical" colorScheme="red" size={size} />
      <MetricCard count={counts.warning} label="Warning" colorScheme="amber" size={size} />
      <MetricCard count={counts.info} label="Info" colorScheme="blue" size={size} />
    </div>
  );
}
