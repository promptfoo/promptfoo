import { cn } from '@app/lib/utils';

interface CodeProps {
  children: React.ReactNode;
  className?: string;
}

function Code({ children, className }: CodeProps) {
  return (
    <pre className={cn('p-2 mb-2 rounded bg-muted font-mono text-sm overflow-x-auto', className)}>
      {children}
    </pre>
  );
}

export { Code };
