import { cn } from '@app/lib/utils';
import { HelpCircle, Info, Lightbulb } from 'lucide-react';

interface InfoBoxProps {
  children: React.ReactNode;
  variant?: 'info' | 'tip' | 'help';
  className?: string;
}

export function InfoBox({ children, variant = 'info', className }: InfoBoxProps) {
  const styles = {
    info: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-700 dark:text-blue-300',
      icon: Info,
    },
    tip: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-700 dark:text-amber-300',
      icon: Lightbulb,
    },
    help: {
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      border: 'border-purple-200 dark:border-purple-800',
      text: 'text-purple-700 dark:text-purple-300',
      icon: HelpCircle,
    },
  }[variant];

  const Icon = styles.icon;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 flex gap-3',
        styles.bg,
        styles.border,
        styles.text,
        className,
      )}
    >
      <Icon className="size-5 shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed flex-1">{children}</div>
    </div>
  );
}
